const enc = new TextEncoder();

function b64url(input: Uint8Array | ArrayBuffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export interface AccessClaims {
  sub: string;
  iat: number;
  exp: number;
  role: 'authenticated';
}

export const ACCESS_TTL_SEC = 15 * 60;

export async function signAccessToken(userId: string, secret: string): Promise<{ token: string; claims: AccessClaims }> {
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessClaims = { sub: userId, iat: now, exp: now + ACCESS_TTL_SEC, role: 'authenticated' };
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = b64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = b64url(enc.encode(JSON.stringify(claims)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return { token: `${data}.${b64url(sig)}`, claims };
}

export interface SupabaseRealtimeClaims {
  sub: string;
  iat: number;
  exp: number;
  aud: 'authenticated';
  role: 'authenticated';
}

export const REALTIME_TOKEN_TTL_SEC = 60 * 60; // 1 hour

// Mints a JWT signed with the Supabase project JWT secret, suitable for
// Supabase Realtime auth. The aud/role claims are required by Supabase
// platform — both must equal 'authenticated' for the JWT to be accepted by
// the Realtime gateway. Pattern mirrors signAccessToken (HS256 via
// crypto.subtle.sign) but with a different secret AND the extra aud claim.
export async function signSupabaseRealtimeToken(
  userId: string,
  supabaseJwtSecret: string,
): Promise<{ token: string; claims: SupabaseRealtimeClaims }> {
  const now = Math.floor(Date.now() / 1000);
  const claims: SupabaseRealtimeClaims = {
    sub: userId,
    iat: now,
    exp: now + REALTIME_TOKEN_TTL_SEC,
    aud: 'authenticated',
    role: 'authenticated',
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = b64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = b64url(enc.encode(JSON.stringify(claims)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await hmacKey(supabaseJwtSecret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return { token: `${data}.${b64url(sig)}`, claims };
}

export function randomRefreshToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

function b64urlToBytes(s: string): Uint8Array {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = t.length % 4;
  if (pad) t += '='.repeat(4 - pad);
  const bin = atob(t);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export interface VerifiedAccess {
  sub: string;
  claims: AccessClaims;
}

// Verifies an HS256 access token minted by signAccessToken: checks alg, signature
// (recomputed + timing-safe compared), and expiry. Returns the `sub` (user id) or throws.
export async function verifyAccessToken(token: string, secret: string): Promise<VerifiedAccess> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT_MALFORMED');
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg?: string };
  try { header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64))); }
  catch { throw new Error('JWT_BAD_HEADER'); }
  if (header.alg !== 'HS256') throw new Error('JWT_BAD_ALG'); // reject 'none'/alg-confusion

  const key = await hmacKey(secret);
  const expectedSig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${headerB64}.${payloadB64}`)));
  if (!timingSafeEqual(expectedSig, b64urlToBytes(sigB64))) throw new Error('JWT_BAD_SIGNATURE');

  let claims: AccessClaims;
  try { claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))); }
  catch { throw new Error('JWT_BAD_PAYLOAD'); }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new Error('JWT_EXPIRED');
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw new Error('JWT_NO_SUB');
  return { sub: claims.sub, claims };
}
