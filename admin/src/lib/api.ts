'use client';

// Phase K.4 — admin-side fetch wrapper for Linky edge functions.
//
// Contract (mirrors app-mobile/src/lib/api.ts so the two stay 1:1 on auth
// posture):
//   - POST ${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${slug}
//   - apikey header = anon publishable key (always)
//   - Authorization header = "Bearer <access_token>" when authed, else anon
//   - Idempotency-Key header = fresh UUID per call (makePost requires one)
//   - On 401 with a session: try /session-refresh once, then retry the call
//     with the new access token. On second 401 → clearSession + redirect
//     /login. On network failure during refresh → propagate the 401, leave
//     the session in place so a manual retry can succeed without forcing
//     a re-login on a flaky network.
//
// Returns a typed { ok, data?, error?, status } envelope so callers can
// branch without try/catch noise. The data side is the parsed JSON of a
// 2xx response; the error side is the server's { code, message_fr } payload.

import { useAuth, type AdminSession, isAccessNearExpiry } from '@/stores/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const REFRESH_TTL_DAYS = 90; // matches server-side jwt.ts ACCESS_TTL_SEC TTL doc
const ACCESS_TTL_SEC = 15 * 60;

export interface ApiError {
  code: string;
  message_fr: string;
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: ApiError;
  status: number;
}

function uuid(): string {
  // crypto.randomUUID is available in all modern browsers and Next.js runtimes.
  // Idempotency keys don't need cryptographic uniqueness — just collision
  // avoidance within the 24h dedupe window.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for very old browsers / SSR contexts without crypto.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function rawPost<T>(
  slug: string,
  body: unknown,
  bearer: string,
): Promise<ApiResult<T>> {
  if (!SUPABASE_URL || !ANON_KEY) {
    return {
      ok: false,
      status: 0,
      error: { code: 'CONFIG_MISSING', message_fr: 'Configuration manquante (NEXT_PUBLIC_SUPABASE_*).' },
    };
  }
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: ANON_KEY,
        authorization: `Bearer ${bearer}`,
        'idempotency-key': uuid(),
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch (e) {
    console.error(`[admin api] network error (${slug}):`, e);
    return { ok: false, status: 0, error: { code: 'NETWORK_ERROR', message_fr: 'Connexion impossible.' } };
  }
  const status = res.status;
  let parsed: unknown = null;
  const raw = await res.text().catch(() => '');
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { /* keep null */ }
  }
  if (res.ok) {
    return { ok: true, data: parsed as T, status };
  }
  const errBody = (parsed as { error?: ApiError } | null)?.error;
  return {
    ok: false,
    status,
    error: errBody ?? { code: 'UNKNOWN', message_fr: 'Erreur inconnue.' },
  };
}

interface RefreshResponse { access_token: string; refresh_token: string }

// Single-flight refresh: multiple concurrent 401s should trigger at most one
// /session-refresh round-trip and share its outcome.
let refreshInFlight: Promise<ApiResult<RefreshResponse>> | null = null;

async function refreshOnce(session: AdminSession): Promise<ApiResult<RefreshResponse>> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      // session-refresh is anon-authed (no Bearer required) but still expects
      // the apikey header. We pass ANON_KEY as Bearer to keep the headers
      // shape identical to the rest of the call sites.
      const r = await rawPost<RefreshResponse>(
        'session-refresh',
        { refresh_token: session.refreshToken },
        ANON_KEY ?? '',
      );
      return r;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// Hard logout helper: clears session and bounces to /login. Used when refresh
// fails so the user gets a clear redirect instead of a stuck-loading state.
function hardLogout() {
  useAuth.getState().clearSession();
  if (typeof window !== 'undefined') {
    // Replace so the back button doesn't bounce back to the authed page.
    window.location.replace('/login');
  }
}

export interface ApiFetchOptions {
  /** Override default authed=true (use false for /email-signin and other
   *  endpoints that issue tokens — they don't need a Bearer). */
  authed?: boolean;
}

export async function apiFetch<T>(
  slug: string,
  body: unknown = {},
  opts: ApiFetchOptions = {},
): Promise<ApiResult<T>> {
  const authed = opts.authed !== false;

  if (!authed) {
    return rawPost<T>(slug, body, ANON_KEY ?? '');
  }

  let session = useAuth.getState().session;
  if (!session) {
    return { ok: false, status: 401, error: { code: 'NO_SESSION', message_fr: 'Session absente.' } };
  }

  // Proactive refresh when within REFRESH_LEAD_SEC of expiry. Avoids the
  // common case of a 401 + retry on the first call after the tab was idle.
  if (isAccessNearExpiry(session)) {
    const r = await refreshOnce(session);
    if (r.ok && r.data) {
      useAuth.getState().applyRefresh({
        accessToken: r.data.access_token,
        refreshToken: r.data.refresh_token,
        accessTokenExpiresAt: Math.floor(Date.now() / 1000) + ACCESS_TTL_SEC,
      });
      session = useAuth.getState().session!;
    } else if (r.status === 401) {
      hardLogout();
      return { ok: false, status: 401, error: r.error ?? { code: 'REFRESH_FAILED', message_fr: 'Session expirée.' } };
    }
    // Network error on proactive refresh — let the actual call proceed with
    // the stale token; if it 401s we'll retry below.
  }

  let r1 = await rawPost<T>(slug, body, session.accessToken);
  if (r1.status !== 401) return r1;

  // Reactive refresh: original call returned 401. Try once.
  const refresh = await refreshOnce(session);
  if (!refresh.ok || !refresh.data) {
    if (refresh.status === 401) hardLogout();
    return r1; // surface the original 401 to the caller
  }
  useAuth.getState().applyRefresh({
    accessToken: refresh.data.access_token,
    refreshToken: refresh.data.refresh_token,
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + ACCESS_TTL_SEC,
  });
  const fresh = useAuth.getState().session!;
  r1 = await rawPost<T>(slug, body, fresh.accessToken);
  if (r1.status === 401) {
    // Still 401 after a fresh token — credentials are revoked server-side
    // (admin demoted, session forcibly revoked, etc.). Hard logout.
    hardLogout();
  }
  return r1;
}

/** Server-issued access token TTL exposed for the login flow's session bookkeeping.
 *  Login computes expiresAt = now + ACCESS_TTL_SEC right after signin. */
export const SERVER_ACCESS_TTL_SEC = ACCESS_TTL_SEC;
export { REFRESH_TTL_DAYS };
