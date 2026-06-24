import { secureStorage } from './storage';

/**
 * Linky session tokens. This app authenticates with the Linky backend's
 * SELF-ROLLED JWT (NOT Supabase Auth): a short-lived access token + a long-lived
 * refresh token, both held in the hardware-backed Keychain/Keystore via
 * `secureStorage` (never `appStorage`/AsyncStorage — those are plaintext).
 *
 * `deviceOnly` keeps them off iCloud backup restore (a stolen backup must not
 * carry a live session). Always `clear()` on sign-out — the iOS Keychain
 * survives uninstall. See docs/security/checklist.md (SEC-STORE-001/003).
 *
 * The token format mirrors the Linky backend: the access token is an HS256 JWT
 * (`sub` = user id) and the refresh token is `"<session_id>.<secret>"`.
 */
const ACCESS_KEY = 'auth.token';
const REFRESH_KEY = 'auth.refreshToken';

export type Tokens = { access_token: string; refresh_token: string };

export const session = {
  getAccessToken: (): Promise<string | null> => secureStorage.get(ACCESS_KEY, { deviceOnly: true }),
  getRefreshToken: (): Promise<string | null> =>
    secureStorage.get(REFRESH_KEY, { deviceOnly: true }),
  async set(tokens: Tokens): Promise<void> {
    await secureStorage.set(ACCESS_KEY, tokens.access_token, { deviceOnly: true });
    await secureStorage.set(REFRESH_KEY, tokens.refresh_token, { deviceOnly: true });
  },
  async clear(): Promise<void> {
    await secureStorage.remove(ACCESS_KEY);
    await secureStorage.remove(REFRESH_KEY);
  },
} as const;

export type Session = typeof session;
