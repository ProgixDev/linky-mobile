import * as SecureStore from 'expo-secure-store';

/**
 * Secure storage — the ONLY sanctioned home for secrets on device.
 *
 * Backed by the iOS Keychain / Android Keystore (hardware-backed where
 * available). Use this for: auth tokens, refresh tokens, API keys you were
 * (reluctantly) handed, anything sensitive. NEVER put secrets in AsyncStorage
 * (`appStorage`) — that's plaintext on disk and readable on a rooted device.
 *
 * See docs/security/threat-model.md and docs/research/01-mobile-security.md §1.
 *
 * Notes / footguns baked in here:
 * - Default accessibility is WHEN_UNLOCKED. For the most sensitive secrets pass
 *   `deviceOnly: true` so the value is NOT restored onto a new device from an
 *   iCloud backup (the *_THIS_DEVICE_ONLY keychain classes).
 * - iOS Keychain SURVIVES app uninstall — always `remove()` on logout; do not
 *   treat uninstall as a wipe.
 * - Values are capped (~2KB on iOS). For large blobs (e.g. a Supabase session)
 *   use `LargeSecureStore`, not this module.
 * - `requireAuthentication` (biometric gate) is intentionally NOT enabled by
 *   default: it is unavailable in Expo Go and invalidates entries when the
 *   user's biometrics change. Opt in per-key via `biometric: true` once you ship
 *   a dev build, and always provide a re-login recovery path.
 */

export type SecureStorageOptions = {
  /** Bind the value to this device only (excluded from iCloud backup restore). */
  deviceOnly?: boolean;
  /** Gate retrieval behind Face ID / Touch ID / passcode. Requires a dev build. */
  biometric?: boolean;
};

function accessible(deviceOnly?: boolean): SecureStore.KeychainAccessibilityConstant {
  return deviceOnly ? SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY : SecureStore.WHEN_UNLOCKED;
}

export const secureStorage = {
  async get(key: string, options: SecureStorageOptions = {}): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key, {
        keychainAccessible: accessible(options.deviceOnly),
        requireAuthentication: options.biometric ?? false,
      });
    } catch {
      // A failed read (e.g. invalidated biometric entry) must not crash the app.
      return null;
    }
  },

  async set(key: string, value: string, options: SecureStorageOptions = {}): Promise<void> {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: accessible(options.deviceOnly),
      requireAuthentication: options.biometric ?? false,
    });
  },

  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
} as const;

export type SecureStorage = typeof secureStorage;
