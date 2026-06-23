import { secureStorage } from './storage';

/**
 * Linky session tokens. The driver app authenticates with the Linky backend's
 * custom JWT (NOT Supabase Auth): a short access token + a refresh token, both
 * held in the hardware-backed Keychain/Keystore via `secureStorage`.
 *
 * `deviceOnly` keeps them off iCloud backup restore (a stolen backup shouldn't
 * carry a live session). Always `clear()` on sign-out — the Keychain survives
 * uninstall. See docs/security/checklist.md (SEC-STORE-001/003).
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
