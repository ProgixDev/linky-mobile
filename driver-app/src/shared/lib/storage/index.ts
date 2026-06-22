/**
 * Storage — the three sanctioned tiers. Pick by sensitivity:
 *
 *   secureStorage      → secrets/tokens (small). Keychain/Keystore, hardware-backed.
 *   LargeSecureStore   → large secrets (e.g. Supabase session >2KB). AES + Keychain.
 *   appStorage         → NON-sensitive client state. Plaintext AsyncStorage.
 *
 * Direct imports of the underlying libraries (`expo-secure-store`,
 * `@react-native-async-storage/async-storage`, `react-native-mmkv`) are banned
 * outside this folder by ESLint, so every storage decision passes through here.
 */
export { secureStorage, type SecureStorage, type SecureStorageOptions } from './secure-storage';
export { appStorage, asyncStorageBackend, type AppStorage } from './app-storage';
export { LargeSecureStore } from './large-secure-store';
