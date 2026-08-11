// Lets an already-authenticated user set/change their own password, so they
// can log back in via email-signin instead of always needing a fresh OTP
// (client 2026-08-05 — avoids the 15-min access token forcing a re-send, and
// saves the daily OTP quota). email-signin already exists and is battle-tested
// (it's the admin's login), this only adds the missing "opt in" step for
// regular marketplace users, who sign up via OTP and therefore start with no
// password_hash.
//
// Step-up verification (client 2026-08-05, same-day follow-up ask): a signin
// session alone isn't proof enough to change a password — sessions live 90
// days, so a lost/borrowed unlocked phone could otherwise let anyone lock the
// real owner out with zero further check.
//
// FRESHNESS BYPASS: if the caller's access token was issued in the last
// FRESH_SESSION_WINDOW_SEC, they just proved possession (OTP signin,
// email-signin, or the "mot de passe oublié" flow, which IS an OTP signin) —
// asking for a second code back-to-back would be pure friction with no
// security gain. Only a STALE session (the real threat: a phone left signed
// in for weeks) is asked to confirm again, via password-change-request's
// otp_id + code (mirrors phone-add-confirm's verification exactly).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { verifyAccessToken } from '@shared/jwt.ts';
import { bcryptHash } from '@shared/bcrypt.ts';
import { matchesOtpCode } from '@shared/phone-code.ts';

interface Body { password: string; otp_id?: string; code?: string }

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const MAX_ATTEMPTS = 5;
const FRESH_SESSION_WINDOW_SEC = 10 * 60;

function valid(b: unknown): b is Body {
  const x = b as Body;
  if (typeof x?.password !== 'string' || x.password.length < PASSWORD_MIN || x.password.length > PASSWORD_MAX) return false;
  if (x.otp_id !== undefined && !/^[0-9a-f-]{36}$/i.test(x.otp_id)) return false;
  if (x.code !== undefined && !/^\d{6}$/.test(x.code)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/auth/set-password', valid, async ({ sb, body, req }) => {
  const jwtSecret = Deno.env.get('LINKY_JWT_SECRET');
  if (!jwtSecret) throwApi('CONFIG_MISSING', 500, 'Configuration manquante');
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  if (!m) throwApi('UNAUTHORIZED', 401, 'Authentification requise.');
  let verified: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    verified = await verifyAccessToken(m[1], jwtSecret);
  } catch {
    throwApi('UNAUTHORIZED', 401, 'Session invalide ou expirée.');
  }
  const userId = verified!.sub;
  const sessionFresh = Date.now() / 1000 - verified!.claims.iat < FRESH_SESSION_WINDOW_SEC;

  if (!sessionFresh) {
    if (!body.otp_id || !body.code) {
      throwApi('OTP_REQUIRED', 428, 'Confirme avec le code envoyé par email ou SMS.');
    }
    const { data: otp, error: eOtp } = await sb
      .from('otp_codes')
      .select('id, target, code_hash, purpose, attempts, expires_at, consumed_at, user_id')
      .eq('id', body.otp_id)
      .maybeSingle();
    if (eOtp) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    if (!otp) throwApi('OTP_NOT_FOUND', 404, 'Code introuvable ou expiré');
    if (otp.purpose !== 'password_change') throwApi('OTP_NOT_FOUND', 404, 'Code introuvable ou expiré');
    if (otp.user_id !== userId) throwApi('OTP_NOT_FOUND', 404, 'Code introuvable ou expiré');
    if (otp.consumed_at) throwApi('OTP_ALREADY_USED', 410, 'Code déjà utilisé');
    if (new Date(otp.expires_at).getTime() <= Date.now()) throwApi('OTP_EXPIRED', 410, 'Code expiré');
    if (otp.attempts >= MAX_ATTEMPTS) throwApi('OTP_TOO_MANY_ATTEMPTS', 429, 'Trop de tentatives');

    const otpSecret = Deno.env.get('LINKY_OTP_HMAC_SECRET');
    if (!otpSecret) throwApi('INTERNAL_ERROR', 500, 'Configuration manquante');
    // Local HMAC compare, or a round-trip to Prelude when it generated the code.
    const ok = await matchesOtpCode({ storedHash: otp.code_hash, target: otp.target, code: body.code, hmacSecret: otpSecret });
    if (!ok) {
      await sb.rpc('increment_otp_attempts', { p_otp_id: otp.id });
      throwApi('OTP_INVALID', 401, 'Code incorrect');
    }

    // Atomic consumption — a racing second confirm with the same code finds
    // no row and bails, so the password can never be set twice off one code.
    const { data: consumed, error: eCons } = await sb
      .from('otp_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', otp.id)
      .is('consumed_at', null)
      .select('id')
      .maybeSingle();
    if (eCons) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    if (!consumed) throwApi('OTP_ALREADY_USED', 410, 'Code déjà utilisé');
  }

  const password_hash = await bcryptHash(body.password);
  const { error } = await sb.from('users').update({ password_hash }).eq('id', userId);
  if (error) {
    console.error('[set-password] update error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement du mot de passe');
  }

  return { body: { ok: true } };
}));
