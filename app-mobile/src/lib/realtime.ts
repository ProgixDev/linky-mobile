// Phase M.3 — Supabase Realtime client bridge.
//
// Linky uses its own JWT for the regular HTTP edge functions (apiPost / Bearer
// header). Supabase Realtime, however, requires a Supabase-signed JWT. We mint
// one via /mint-realtime-jwt (M.2) and apply it to a singleton supabase-js
// client used ONLY for realtime channels.
//
// Lifecycle :
//   - Lazy mint on first subscription (ensureRealtimeAuth).
//   - TTL = 1 hour. Re-mint when within 5 min of expiry.
//   - Periodic background refresh every 30 min to keep long-lived screens fresh.
//   - Single-flight to avoid concurrent mint storms.
//
// auth.persistSession = false because we don't use Supabase auth sessions
// (no signInWithPassword) — only the realtime channel auth.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { apiPost } from './api';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

const REFRESH_LEAD_MS = 5 * 60 * 1000;
const BG_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

let _client: SupabaseClient | null = null;
let _realtimeJwt: string | null = null;
let _expiresAt = 0;
let _mintInFlight: Promise<void> | null = null;
let _bgInterval: ReturnType<typeof setInterval> | null = null;

interface MintResponse {
  realtime_jwt: string;
  expires_in: number;
}

export function getRealtimeClient(): SupabaseClient {
  if (_client) return _client;
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('[realtime] EXPO_PUBLIC_SUPABASE_URL / ANON_KEY missing');
  }
  _client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  if (!_bgInterval) {
    _bgInterval = setInterval(() => {
      ensureRealtimeAuth().catch((e) =>
        console.warn('[realtime] background refresh failed:', e),
      );
    }, BG_REFRESH_INTERVAL_MS);
  }
  return _client;
}

async function mintAndApply(): Promise<void> {
  const r = await apiPost<MintResponse>({ path: '/mint-realtime-jwt', body: {} });
  _realtimeJwt = r.realtime_jwt;
  _expiresAt = Date.now() + r.expires_in * 1000;
  await getRealtimeClient().realtime.setAuth(_realtimeJwt);
}

export async function ensureRealtimeAuth(): Promise<void> {
  const now = Date.now();
  if (_realtimeJwt && _expiresAt - now > REFRESH_LEAD_MS) return;
  if (!_mintInFlight) {
    _mintInFlight = mintAndApply().finally(() => {
      _mintInFlight = null;
    });
  }
  await _mintInFlight;
}

// Call from sign-out to invalidate cached realtime token.
// (Doesn't disconnect the websocket — callers should unsubscribe their channels.)
export function resetRealtimeAuth(): void {
  _realtimeJwt = null;
  _expiresAt = 0;
}
