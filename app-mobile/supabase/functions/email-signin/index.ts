// Phase K.4 — admin login wiring.
//
// Additive change: this endpoint now selects `is_admin` from public.users and
// returns it in the user payload so the Next.js admin shell (`admin/`) can gate
// access without a second round-trip. No change to JWT mint, refresh, rate
// limit, or idempotency. The boolean is also enumeration-safe — non-admin users
// hit the same login path with the same response shape, just is_admin: false.
//
// Mobile clients ignore the field (AuthUser.is_admin is optional in the mobile
// type, see app-mobile/src/data/queries/auth.ts).

import { makePost, stripTokens } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { normalizeEmail } from '@shared/validate.ts';
import { signAccessToken, randomRefreshToken } from '@shared/jwt.ts';
import { bcryptHash, bcryptCompare } from '@shared/bcrypt.ts';

interface Body { email: string; password: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.email === 'string' && typeof x.password === 'string' && x.password.length > 0;
}

const REFRESH_TTL_DAYS = 90;

// Pre-computed bcrypt(10) hash. Used to keep signin response timing constant when the supplied
// email doesn't exist — prevents user-existence enumeration via timing side-channel (2E).
// Safe to be public: knowing the dummy gives an attacker nothing.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

// Rate-limit constants (2F)
const SIGNIN_FAIL_LIMIT_PER_EMAIL = 5;
const SIGNIN_FAIL_WINDOW_MIN = 15;
const SIGNIN_FAIL_LIMIT_PER_IP = 20;
const SIGNIN_IP_WINDOW_MIN = 60;

function getClientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (!fwd) return null;
  const first = fwd.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

Deno.serve(makePost<Body>('/v1/auth/email/signin', valid, async ({ sb, body, req }) => {
  const normalizedEmail = normalizeEmail(body.email);
  // Use the normalized email as the rate-limit key when valid; otherwise hash the raw input.
  // Either way the bcrypt path below always runs so timing stays constant for invalid formats too.
  const target = normalizedEmail ?? body.email.trim().toLowerCase().slice(0, 254);
  const ip = getClientIp(req);
  const now = Date.now();

  // 2F: rate limit BEFORE bcrypt — saves a 100ms compute per blocked attempt.
  const emailWindowAgo = new Date(now - SIGNIN_FAIL_WINDOW_MIN * 60_000).toISOString();
  const { count: emailFailCount } = await sb
    .from('signin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('target', target)
    .eq('succeeded', false)
    .gte('created_at', emailWindowAgo);
  if ((emailFailCount ?? 0) >= SIGNIN_FAIL_LIMIT_PER_EMAIL) {
    throwApi('SIGNIN_RATE_LIMITED', 429, 'Trop de tentatives. Réessaie dans quelques minutes.');
  }

  if (ip) {
    const ipWindowAgo = new Date(now - SIGNIN_IP_WINDOW_MIN * 60_000).toISOString();
    const { count: ipFailCount } = await sb
      .from('signin_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('succeeded', false)
      .gte('created_at', ipWindowAgo);
    if ((ipFailCount ?? 0) >= SIGNIN_FAIL_LIMIT_PER_IP) {
      throwApi('SIGNIN_RATE_LIMITED', 429, 'Trop de tentatives. Réessaie plus tard.');
    }
  }

  // 2E: lookup runs against the normalized address if valid, otherwise against a sentinel that
  // can never match a real email. This keeps the DB roundtrip on both branches — same query plan,
  // same network shape — so an attacker can't time-distinguish "invalid format" from "not found".
  const lookupAddress = normalizedEmail ?? '\x00invalid\x00';
  const { data: row } = await sb
    .from('emails')
    .select('user_id, users:users(id, display_name, avatar_url, locale, kyc_status, password_hash, status, is_admin)')
    .eq('address', lookupAddress)
    .maybeSingle();

  // is_admin is exposed in the response (defaults false) so the admin shell can
  // gate on it without a second round-trip. Non-admin callers (every mobile
  // user) just see is_admin=false, which the mobile app's AuthUser type
  // tolerates (optional field). The mobile UI never uses it; only the admin
  // shell does.
  const user = (row?.users ?? null) as {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    locale: string;
    kyc_status: string;
    password_hash: string | null;
    status: string;
    is_admin: boolean;
  } | null;

  // 2E: always bcryptCompare — real hash if user exists, DUMMY_HASH otherwise. Same compute cost
  // either way, so response time doesn't leak existence.
  const hashToCheck = user?.password_hash ?? DUMMY_HASH;
  const bcryptOk = await bcryptCompare(body.password, hashToCheck);

  const valid =
    !!user &&
    !!user.password_hash &&
    user.status === 'active' &&
    bcryptOk;

  // Log every attempt (success and failure) for the rate limiter to see.
  await sb.from('signin_attempts').insert({ target, ip, succeeded: valid });

  if (!valid) throwApi('AUTH_INVALID_CREDENTIALS', 401, 'Identifiants invalides');

  const jwtSecret = Deno.env.get('LINKY_JWT_SECRET');
  if (!jwtSecret) throwApi('INTERNAL_ERROR', 500, 'Configuration manquante');
  const { token: access_token } = await signAccessToken(user!.id, jwtSecret);
  const refreshSecret = randomRefreshToken();
  const refresh_hash = await bcryptHash(refreshSecret);
  const expires_at = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: sess, error: eSess } = await sb.from('sessions').insert({
    user_id: user!.id,
    refresh_token_hash: refresh_hash,
    user_agent: req.headers.get('user-agent'),
    expires_at,
  }).select('id').single();
  if (eSess || !sess) throwApi('INTERNAL_ERROR', 500, 'Erreur création session');

  const { password_hash: _ph, status: _st, ...userOut } = user!;
  return { body: { access_token, refresh_token: `${sess.id}.${refreshSecret}`, user: userOut } };
}, stripTokens));
