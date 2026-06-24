// URL polyfill is required for supabase-js on React Native (Hermes URL is incomplete).
import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from './env';
import { LargeSecureStore } from './storage';

/**
 * The Supabase client. Security-critical configuration — read before changing:
 *
 * - **Session lives in `LargeSecureStore`** (AES + Keychain), NOT AsyncStorage.
 *   A Supabase session exceeds the iOS Keychain's ~2KB limit, so we encrypt it.
 * - **`flowType: 'pkce'`** — mandatory for a public mobile client; an intercepted
 *   OAuth code is useless without the locally-stored verifier.
 * - **`detectSessionInUrl: false`** — that is a web-only mechanism; native gets the
 *   callback via a (verified) deep link and exchanges the code explicitly.
 * - **`lock: processLock`** — serialises concurrent token refreshes.
 * - We ship the **anon/publishable** key only (env.ts rejects a service_role key).
 *   The real authorization boundary is **RLS** — see supabase/migrations and
 *   docs/architecture/backend.md.
 *
 * NOTE: run `supabase gen types typescript` and pass `createClient<Database>` once
 * you have a schema, to get end-to-end typed queries.
 */
export const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      // SecureStore is unavailable on web; let supabase-js use its web default there.
      ...(Platform.OS !== 'web' ? { storage: new LargeSecureStore() } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      lock: processLock,
    },
  },
);

/**
 * Refresh the session only while the app is foregrounded (native). Call once at
 * app start (wired in `src/app/_layout.tsx`). No-op on web.
 */
export function registerSupabaseAutoRefresh(): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
  return () => sub.remove();
}
