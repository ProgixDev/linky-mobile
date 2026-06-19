import { verifyAccessToken } from '@shared/jwt.ts';
import { throwApi } from '@shared/errors.ts';

// Extracts + verifies the Linky access token from the `Authorization: Bearer <token>` header
// (the mobile client sends the user JWT there and the anon key in `apikey`). Returns the
// authenticated user id (the token's `sub`). Throws UNAUTHORIZED (401) on any failure.
export async function requireUser(req: Request): Promise<string> {
  const secret = Deno.env.get('LINKY_JWT_SECRET');
  if (!secret) throwApi('CONFIG_MISSING', 500, 'Configuration manquante');
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  if (!m) throwApi('UNAUTHORIZED', 401, 'Authentification requise.');
  try {
    const { sub } = await verifyAccessToken(m[1], secret);
    return sub;
  } catch {
    throwApi('UNAUTHORIZED', 401, 'Session invalide ou expirée.');
  }
}

// Optional-auth variant for endpoints that are public but want to enrich the
// response when a signed-in caller is recognized. Returns null on missing /
// malformed / expired bearer ; never throws. Use this when the unauth response
// is a strict subset of the authed one (e.g. is_following=false stays valid
// for anonymous callers).
export async function tryGetUser(req: Request): Promise<string | null> {
  const secret = Deno.env.get('LINKY_JWT_SECRET');
  if (!secret) return null;
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { sub } = await verifyAccessToken(m[1], secret);
    return sub;
  } catch {
    return null;
  }
}
