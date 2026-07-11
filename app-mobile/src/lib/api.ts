// Thin fetch wrapper for Linky edge functions.
// - Injects apikey + Bearer access token (when present)
// - Generates an Idempotency-Key per POST
// - On 401 with an access token, attempts a silent refresh, then retries once
// - Returns the parsed JSON body (or throws ApiError on non-2xx)

import { secure, SECURE_KEYS } from './storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !ANON_KEY) {
  // Will surface during dev as a clear error rather than a confusing fetch failure.
  console.warn('[api] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing');
}

const FN_BASE = `${SUPABASE_URL ?? ''}/functions/v1`;

export interface ApiErrorBody {
  code: string;
  message_fr: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  message_fr: string;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message_fr || body.code);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.message_fr = body.message_fr;
    // Hermes/Babel subclass-of-Error footgun: in some transpilation paths the
    // prototype chain is dropped, so instance properties set after super() can
    // disappear. Re-pin the prototype defensively.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// Server may return either { error: { code, message_fr } } or a flat
// { code, message_fr } depending on layer. Try both before falling back.
function parseErrorBody(raw: string): ApiErrorBody | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { error?: ApiErrorBody; code?: string; message_fr?: string };
    if (j?.error?.code) return j.error;
    if (j?.code) return { code: j.code, message_fr: j.message_fr ?? '' };
    return null;
  } catch {
    return null;
  }
}

// Pulls a user-facing French message out of anything thrown by apiPost.
// Useful in screen catch blocks where the thrown value's runtime shape may
// vary (ApiError instance, plain object, TypeError from fetch failure, etc).
export function toToastMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message_fr || fallback;
  if (e && typeof e === 'object') {
    const o = e as { message_fr?: unknown; message?: unknown };
    if (typeof o.message_fr === 'string' && o.message_fr) return o.message_fr;
    if (typeof o.message === 'string' && o.message) return o.message;
  }
  return fallback;
}

function uuid(): string {
  // RFC 4122 v4 via Math.random. Hermes here doesn't expose globalThis.crypto,
  // and idempotency keys don't need cryptographic randomness — just uniqueness.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0;
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface RefreshResponse { access_token: string; refresh_token: string }

async function callRefresh(refreshToken: string): Promise<RefreshResponse> {
  let res: Response;
  try {
    res = await fetch(`${FN_BASE}/session-refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: ANON_KEY ?? '',
        authorization: `Bearer ${ANON_KEY ?? ''}`,
        'idempotency-key': uuid(),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch (e) {
    console.error('[api] network error (session-refresh):', e);
    throw new ApiError(0, { code: 'NETWORK_ERROR', message_fr: 'Connexion impossible' });
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    console.error('[api] session-refresh non-2xx', res.status, raw);
    const parsed = parseErrorBody(raw);
    throw new ApiError(res.status, parsed ?? { code: 'REFRESH_FAILED', message_fr: 'Erreur de rafraîchissement' });
  }
  return (await res.json()) as RefreshResponse;
}

// Decode a JWT's `exp` (seconds since epoch) without a library. Hermes lacks a
// reliable atob, so base64url is decoded by hand. Returns null on any parse
// failure — the caller treats null as "unknown → don't proactively refresh".
// Only `exp` (an ASCII number) is read, so the Latin-1 byte decode is safe for
// our self-rolled payload ({ sub, iat, exp, role }).
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function jwtExp(token: string): number | null {
  try {
    const seg = token.split('.')[1];
    if (!seg) return null;
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    let bits = 0, val = 0, out = '';
    for (const ch of b64) {
      const idx = B64_ALPHABET.indexOf(ch);
      if (idx === -1) continue;
      val = (val << 6) | idx;
      bits += 6;
      if (bits >= 8) { bits -= 8; out += String.fromCharCode((val >> bits) & 0xff); }
    }
    const claims = JSON.parse(out) as { exp?: number };
    return typeof claims.exp === 'number' ? claims.exp : null;
  } catch {
    return null;
  }
}

// Single-flight refresh: many in-flight requests may all 401 at once.
let refreshInFlight: Promise<RefreshResponse> | null = null;

async function refreshOnce(refreshToken: string): Promise<RefreshResponse> {
  if (!refreshInFlight) {
    refreshInFlight = callRefresh(refreshToken).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export interface ApiCallOptions {
  path: string;          // e.g. '/otp-request'
  body?: unknown;
  authed?: boolean;      // include user Bearer token; default true except for auth endpoints
  idempotencyKey?: string;
}

export async function apiPost<T>({ path, body, authed = true, idempotencyKey }: ApiCallOptions): Promise<T> {
  if (!SUPABASE_URL || !ANON_KEY) throw new ApiError(0, { code: 'CONFIG_MISSING', message_fr: 'Configuration manquante' });

  const buildHeaders = async (): Promise<Record<string, string>> => {
    const access = authed ? await secure.get(SECURE_KEYS.authToken) : null;
    const bearer = access ?? ANON_KEY;
    return {
      'content-type': 'application/json',
      apikey: ANON_KEY,
      authorization: `Bearer ${bearer}`,
      'idempotency-key': idempotencyKey ?? uuid(),
    };
  };

  const send = async (headers: Record<string, string>): Promise<Response> => {
    try {
      return await fetch(`${FN_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
      });
    } catch (e) {
      console.error(`[api] network error (POST ${path}):`, e);
      throw new ApiError(0, { code: 'NETWORK_ERROR', message_fr: 'Connexion impossible' });
    }
  };

  // Proactive refresh: an access token lives only 15 min. Optional-auth reads
  // (list-comments and other public-but-personalized endpoints) return 200 even
  // with an EXPIRED token — the server just treats the caller as anonymous — so
  // the reactive 401 path below never fires and the app can sit on a stale token
  // (symptom: comment hearts show empty after 15 min away, and a tap removes the
  // real like). If the stored token is already expired and a refresh token
  // exists, refresh BEFORE the call. refreshOnce is single-flight; on failure we
  // fall through (the 401 path / anonymous read remains the backstop).
  if (authed) {
    const stored = await secure.get(SECURE_KEYS.authToken);
    const exp = stored ? jwtExp(stored) : null;
    if (exp !== null && exp * 1000 <= Date.now() + 30_000) {
      const refresh = await secure.get(SECURE_KEYS.refreshToken);
      if (refresh) {
        try {
          const next = await refreshOnce(refresh);
          await secure.set(SECURE_KEYS.authToken, next.access_token);
          await secure.set(SECURE_KEYS.refreshToken, next.refresh_token);
        } catch {
          /* fall through — reactive 401 refresh below is the backstop */
        }
      }
    }
  }

  let headers = await buildHeaders();
  let res = await send(headers);

  // 401 path: try a silent refresh once, then retry the original call with the new access token.
  if (res.status === 401 && authed) {
    const refresh = await secure.get(SECURE_KEYS.refreshToken);
    if (refresh) {
      try {
        const next = await refreshOnce(refresh);
        await secure.set(SECURE_KEYS.authToken, next.access_token);
        await secure.set(SECURE_KEYS.refreshToken, next.refresh_token);
        headers = await buildHeaders();
        res = await send(headers);
      } catch {
        // Refresh failed → user is logged out. Clear and propagate the original 401.
        await secure.remove(SECURE_KEYS.authToken);
        await secure.remove(SECURE_KEYS.refreshToken);
      }
    }
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    console.error(`[api] POST ${path} non-2xx`, res.status, raw);
    const parsed = parseErrorBody(raw);
    throw new ApiError(res.status, parsed ?? { code: 'UNKNOWN', message_fr: 'Erreur réseau' });
  }
  return (await res.json()) as T;
}
