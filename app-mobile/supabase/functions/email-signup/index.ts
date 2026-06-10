import { makePost, stripTokens } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { normalizeEmail } from '@shared/validate.ts';
import { signAccessToken, randomRefreshToken } from '@shared/jwt.ts';
import { bcryptHash } from '@shared/bcrypt.ts';

interface Body { email: string; password: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.email === 'string' && typeof x.password === 'string' && x.password.length >= 6;
}

const REFRESH_TTL_DAYS = 90;

Deno.serve(makePost<Body>('/v1/auth/email/signup', valid, async ({ sb, body, req }) => {
  const email = normalizeEmail(body.email);
  if (!email) throwApi('INVALID_TARGET', 400, 'Email invalide');
  if (body.password.length < 6) throwApi('PASSWORD_TOO_SHORT', 400, 'Mot de passe trop court (min. 6 caractères)');

  const password_hash = await bcryptHash(body.password);

  // 2C + 2D: transactional create via RPC. The RPC inserts both users + emails atomically,
  // letting unique_violation (23505) on emails.address bubble up — PG rolls back the user
  // row so no orphans. verified_at is intentionally NULL inside the RPC (2D).
  const { data: rows, error: eRpc } = await sb.rpc('create_user_with_email', {
    p_address: email,
    p_password_hash: password_hash,
  });
  if (eRpc) {
    if (eRpc.code === '23505') throwApi('EMAIL_ALREADY_REGISTERED', 409, 'Email déjà utilisé');
    console.error('[email-signup] RPC error:', eRpc);
    throwApi('INTERNAL_ERROR', 500, 'Erreur création utilisateur');
  }
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    throwApi('INTERNAL_ERROR', 500, 'Erreur création utilisateur');
  }
  const user = rows[0] as {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    locale: string;
  };

  const jwtSecret = Deno.env.get('LINKY_JWT_SECRET');
  if (!jwtSecret) throwApi('INTERNAL_ERROR', 500, 'Configuration manquante');
  const { token: access_token } = await signAccessToken(user.id, jwtSecret);
  const refreshSecret = randomRefreshToken();
  const refresh_hash = await bcryptHash(refreshSecret);
  const expires_at = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: sess, error: eSess } = await sb.from('sessions').insert({
    user_id: user.id,
    refresh_token_hash: refresh_hash,
    user_agent: req.headers.get('user-agent'),
    expires_at,
  }).select('id').single();
  if (eSess || !sess) throwApi('INTERNAL_ERROR', 500, 'Erreur création session');

  // kyc_status aligned with otp-verify / email-signin payloads ; a fresh
  // account is always 'none' (the RPC doesn't return the column).
  return { body: { access_token, refresh_token: `${sess.id}.${refreshSecret}`, user: { ...user, kyc_status: 'none' } } };
}, stripTokens));
