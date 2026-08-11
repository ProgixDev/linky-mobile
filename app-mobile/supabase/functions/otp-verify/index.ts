import { makePost, stripTokens } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { matchesOtpCode } from '@shared/phone-code.ts';
import { signAccessToken, randomRefreshToken } from '@shared/jwt.ts';
import { bcryptHash } from '@shared/bcrypt.ts';
import { detectCarrier } from '@shared/validate.ts';

interface Body { otp_id: string; code: string; app?: 'driver' | 'marketplace' }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.otp_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.otp_id)
    && typeof x.code === 'string' && /^\d{6}$/.test(x.code)
    && (x.app === undefined || x.app === 'driver' || x.app === 'marketplace');
}

const MAX_ATTEMPTS = 5;
const REFRESH_TTL_DAYS = 90;

Deno.serve(makePost<Body>('/v1/otp/verify', valid, async ({ sb, body, req }) => {
  const { data: otp, error: eOtp } = await sb
    .from('otp_codes')
    .select('id, channel, target, code_hash, purpose, attempts, expires_at, consumed_at, user_id')
    .eq('id', body.otp_id)
    .maybeSingle();
  if (eOtp) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!otp) throwApi('OTP_NOT_FOUND', 404, 'Code introuvable ou expiré');
  if (otp.consumed_at) throwApi('OTP_ALREADY_USED', 410, 'Code déjà utilisé');
  if (new Date(otp.expires_at).getTime() <= Date.now()) throwApi('OTP_EXPIRED', 410, 'Code expiré');

  const hmacSecret = Deno.env.get('LINKY_OTP_HMAC_SECRET');
  const jwtSecret = Deno.env.get('LINKY_JWT_SECRET');
  if (!hmacSecret || !jwtSecret) throwApi('INTERNAL_ERROR', 500, 'Configuration manquante');

  // AUTH-02 fix: register this attempt ATOMICALLY *before* comparing the code,
  // and gate on the value the atomic UPDATE returns — not on the stale `attempts`
  // read above. increment_otp_attempts does `update ... set attempts = attempts+1
  // returning attempts`, so the row lock serializes a concurrent burst: each
  // request gets a distinct sequential count and everything past MAX_ATTEMPTS is
  // rejected before any comparison. Previously the gate read a stale snapshot and
  // only incremented on a wrong guess, so a high-concurrency flood could run far
  // more than MAX_ATTEMPTS comparisons against one otp_id and brute-force it.
  const { data: attemptsNow, error: eInc } = await sb.rpc('increment_otp_attempts', { p_otp_id: otp.id });
  if (eInc) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (typeof attemptsNow === 'number' && attemptsNow > MAX_ATTEMPTS) {
    throwApi('OTP_TOO_MANY_ATTEMPTS', 429, 'Trop de tentatives');
  }

  // Local HMAC compare, or a round-trip to Prelude when Prelude generated the
  // code (its `custom_code` is gated on our account, so it owns the secret).
  // matchesOtpCode fails closed on any doubt.
  const ok = await matchesOtpCode({ storedHash: otp.code_hash, target: otp.target, code: body.code, hmacSecret });
  if (!ok) {
    // Attempt already counted atomically above.
    throwApi('OTP_INVALID', 401, 'Code incorrect');
  }

  // 2A: atomic consumption BEFORE any user creation. If another verify with the same code
  // raced us and consumed first, the .is('consumed_at', null) filter returns no row and we
  // bail without minting tokens.
  const { data: consumed, error: eCons } = await sb
    .from('otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', otp.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  if (eCons) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!consumed) throwApi('OTP_ALREADY_USED', 410, 'Code déjà utilisé');

  // 2C: transactional find-or-create via RPC. Wraps user + identity insert in a single PG tx,
  // so a unique-violation race rolls back the orphan user row. The RPC returns
  // (id, was_created) — was_created lets the client tell login from signup so
  // a returning user skips profile-setup (which would overwrite their
  // display_name/role) and routes straight into their existing account.
  let userId: string;
  let wasCreated: boolean;
  if (otp.channel === 'phone') {
    const { data: rows, error: eRpc } = await sb.rpc('find_or_create_user_with_phone', {
      p_e164: otp.target,
      p_carrier: detectCarrier(otp.target),
    });
    if (eRpc || !rows || !Array.isArray(rows) || rows.length === 0) {
      console.error('[otp-verify] find_or_create_user_with_phone failed:', eRpc);
      throwApi('INTERNAL_ERROR', 500, 'Erreur création utilisateur');
    }
    userId = (rows[0] as { id: string; was_created: boolean }).id;
    wasCreated = (rows[0] as { id: string; was_created: boolean }).was_created;
  } else {
    const { data: rows, error: eRpc } = await sb.rpc('find_or_create_user_with_email', {
      p_address: otp.target,
    });
    if (eRpc || !rows || !Array.isArray(rows) || rows.length === 0) {
      console.error('[otp-verify] find_or_create_user_with_email failed:', eRpc);
      throwApi('INTERNAL_ERROR', 500, 'Erreur création utilisateur');
    }
    userId = (rows[0] as { id: string; was_created: boolean }).id;
    wasCreated = (rows[0] as { id: string; was_created: boolean }).was_created;
  }

  // Backfill user_id on the (already-consumed) OTP row for audit traceability.
  await sb.from('otp_codes').update({ user_id: userId }).eq('id', otp.id);

  // Mark a NEWLY-created account with the app it was born in, so the driver app can
  // refuse a login from a marketplace email (driver ≠ customer). Existing accounts keep
  // their origin. Best-effort — must never block issuing the session.
  if (wasCreated && body.app === 'driver') {
    await sb.from('users').update({ origin_app: 'driver' }).eq('id', userId);
  }

  // Suspended / deleted accounts cannot obtain a session — the mobile OTP path
  // must enforce this like email-signin already does, otherwise admin
  // suspension is toothless. A brand-new account defaults to 'active', so
  // signup is unaffected. Checked BEFORE the session is created.
  const { data: statusRow } = await sb.from('users').select('status').eq('id', userId).maybeSingle();
  if (statusRow && (statusRow as { status?: string }).status !== 'active') {
    throwApi('ACCOUNT_SUSPENDED', 403, 'Ce compte a été suspendu. Contacte le support Linky.');
  }

  const { token: access_token } = await signAccessToken(userId, jwtSecret);
  // Refresh token format: "<session_id>.<secret>". Embedding the session id lets refresh look up
  // the row by primary key instead of scanning every session by hash.
  const refreshSecret = randomRefreshToken();
  const refresh_hash = await bcryptHash(refreshSecret);
  const expires_at = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000).toISOString();

  const { data: sess, error: eSess } = await sb.from('sessions').insert({
    user_id: userId,
    refresh_token_hash: refresh_hash,
    user_agent: req.headers.get('user-agent'),
    expires_at,
  }).select('id').single();
  if (eSess || !sess) throwApi('INTERNAL_ERROR', 500, 'Erreur création session');
  const refresh_token = `${sess.id}.${refreshSecret}`;

  // Phase T.1 — roles + city included so the client's auth store rehydrates
  // from the server (server wins, MMKV is the offline cache). Without this,
  // a reinstall or sign-in on a second device silently degrades a seller
  // back to ['buyer'].
  //
  // T.1.fix — surface the select error instead of silently returning a null
  // user inside a 200 body. A schema or transport hiccup here previously
  // masqueraded as a successful sign-in with no profile, which the mobile
  // app then turned into a confusing "Toi" state.
  const { data: user, error: eUser } = await sb
    .from('users')
    .select('id, display_name, avatar_url, locale, kyc_status, city, roles')
    .eq('id', userId)
    .single();
  if (eUser || !user) {
    console.error('[otp-verify] user select error:', eUser);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return { body: { access_token, refresh_token, user, was_created: wasCreated } };
}, stripTokens));
