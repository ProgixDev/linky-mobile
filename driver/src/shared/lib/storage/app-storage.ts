import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * App storage — non-sensitive client state only (UI prefs, caches, last-seen
 * flags, persisted feature stores that hold no secrets/PII).
 *
 * This is PLAINTEXT on disk. If a value is a secret, a token, or personal data,
 * it does NOT belong here — use `secureStorage` (small secrets) or
 * `LargeSecureStore` (large encrypted blobs like an auth session).
 *
 * This module is the single sanctioned wrapper around AsyncStorage. ESLint bans
 * importing `@react-native-async-storage/async-storage` anywhere else (see
 * eslint.config.js), so the "is this safe to store?" decision always passes
 * through here.
 */

export const appStorage = {
  get: (key: string): Promise<string | null> => AsyncStorage.getItem(key),
  set: (key: string, value: string): Promise<void> => AsyncStorage.setItem(key, value),
  remove: (key: string): Promise<void> => AsyncStorage.removeItem(key),
} as const;

/**
 * The raw AsyncStorage instance, for adapters that need the full StateStorage
 * shape (e.g. Zustand's `createJSONStorage(() => asyncStorageBackend)`). Only
 * use this for NON-SENSITIVE persisted stores.
 */
export const asyncStorageBackend = AsyncStorage;

export type AppStorage = typeof appStorage;
