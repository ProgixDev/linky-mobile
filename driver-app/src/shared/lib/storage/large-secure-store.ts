// Polyfill crypto.getRandomValues for React Native (must load before aes-js use).
import 'react-native-get-random-values';
import * as aesjs from 'aes-js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * LargeSecureStore — secure storage for values larger than the iOS Keychain's
 * ~2KB limit (the classic example: a Supabase auth session, which is an access
 * JWT + refresh token + user object and routinely exceeds 2KB).
 *
 * Strategy: a small 256-bit AES key lives in the Keychain/Keystore
 * (`secureStorage`), and the large value is AES-CTR-encrypted and parked in
 * AsyncStorage as ciphertext. The plaintext never touches AsyncStorage; an
 * attacker with disk access only sees ciphertext, and the key is hardware-backed.
 *
 * Implements the `getItem`/`setItem`/`removeItem` shape expected by
 * `supabase-js`'s `auth.storage` (wired up in Phase 2). See
 * docs/research/01-mobile-security.md §1 and docs/research/03-supabase-security.md §2.
 */
export class LargeSecureStore {
  private encKeyName(key: string): string {
    return `${key}__enckey`;
  }

  /** Encrypt `value` with a freshly generated key and persist the key securely. */
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(this.encKeyName(key), aesjs.utils.hex.fromBytes(encryptionKey), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });

    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, ciphertextHex: string): Promise<string | null> {
    const keyHex = await SecureStore.getItemAsync(this.encKeyName(key));
    if (!keyHex) return null;

    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(keyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(ciphertextHex));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    try {
      const ciphertext = await AsyncStorage.getItem(key);
      if (!ciphertext) return null;
      return await this.decrypt(key, ciphertext);
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const ciphertext = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, ciphertext);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(this.encKeyName(key));
  }
}
