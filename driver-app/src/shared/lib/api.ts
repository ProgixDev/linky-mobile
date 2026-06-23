// Thin fetch client for Linky edge functions — the driver app's ONLY way to call
// the backend. Mirrors app-mobile/src/lib/api.ts so both apps speak the backend's
// convention:
//   - apikey: <anon> + authorization: Bearer <Linky access token> (or anon when unauthed)
//   - a unique Idempotency-Key per POST (the backend requires it)
//   - on 401 with a token: one silent /session-refresh, then retry once
//   - parse { error: { code, message_fr } } into ApiError on non-2xx
// The driver app does NOT use supabase.functions.invoke (that sends a Supabase
// session token the Linky backend can't verify).
import { env } from './env';
import { makeId } from './id';
import { session } from './session';

const FN_BASE = `${env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;
const ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
    // Hermes/Babel subclass-of-Error footgun: re-pin the prototype so
    // `instanceof ApiError` and the instance fields survive transpilation.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// The backend returns { error: { code, message_fr } }; some layers send it flat.
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

/** Pull a user-facing message out of anything thrown by apiPost. */
export function toToastMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message_fr || fallback;
  if (e && typeof e === 'object') {
    const o = e as { message_fr?: unknown; message?: unknown };
    if (typeof o.message_fr === 'string' && o.message_fr) return o.message_fr;
    if (typeof o.message === 'string' && o.message) return o.message;
  }
  return fallback;
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

async function callRefresh(refreshToken: string): Promise<RefreshResponse> {
  let res: Response;
  try {
    res = await fetch(`${FN_BASE}/session-refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: ANON_KEY,
        authorization: `Bearer ${ANON_KEY}`,
        'idempotency-key': makeId(),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message_fr: 'Connexion impossible' });
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new ApiError(
      res.status,
      parseErrorBody(raw) ?? { code: 'REFRESH_FAILED', message_fr: 'Session expirée' },
    );
  }
  return (await res.json()) as RefreshResponse;
}

// Single-flight refresh: many in-flight requests can 401 at once.
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
  path: string; // e.g. '/email-signin', '/list-livreur-deliveries'
  body?: unknown;
  /** Include the user Bearer token (default true; false for auth endpoints). */
  authed?: boolean;
  idempotencyKey?: string;
}

export async function apiPost<T>({
  path,
  body,
  authed = true,
  idempotencyKey,
}: ApiCallOptions): Promise<T> {
  const buildHeaders = async (): Promise<Record<string, string>> => {
    const access = authed ? await session.getAccessToken() : null;
    return {
      'content-type': 'application/json',
      apikey: ANON_KEY,
      authorization: `Bearer ${access ?? ANON_KEY}`,
      'idempotency-key': idempotencyKey ?? makeId(),
    };
  };

  const send = async (headers: Record<string, string>): Promise<Response> => {
    try {
      return await fetch(`${FN_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
      });
    } catch {
      throw new ApiError(0, { code: 'NETWORK_ERROR', message_fr: 'Connexion impossible' });
    }
  };

  let res = await send(await buildHeaders());

  // 401 with a token → one silent refresh, then retry once.
  if (res.status === 401 && authed) {
    const refresh = await session.getRefreshToken();
    if (refresh) {
      try {
        const next = await refreshOnce(refresh);
        await session.set(next);
        res = await send(await buildHeaders());
      } catch {
        await session.clear();
      }
    }
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new ApiError(
      res.status,
      parseErrorBody(raw) ?? { code: 'UNKNOWN', message_fr: 'Erreur réseau' },
    );
  }
  return (await res.json()) as T;
}
