// Persistent storage wrapper. MMKV for fast key-value; expo-secure-store for tokens.
// MMKV requires a dev build (does not work in Expo Go).

import { createMMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';

export const storage = createMMKV({ id: 'linky-prefs' });

export const STORAGE_KEYS = {
  themePreference: 'theme.preference',
  dataSaver: 'prefs.dataSaver',
  language: 'prefs.lang',
  notificationsEnabled: 'prefs.notifications',
  privacyPersonalize: 'prefs.privacy.personalize',
  privacyAnalytics: 'prefs.privacy.analytics',
  privacyAdTracking: 'prefs.privacy.adTracking',
  privacyProfilePublic: 'prefs.privacy.profilePublic',
  onboardingDone: 'auth.onboardingDone',
  currentUserId: 'auth.currentUserId',
  authUserJson: 'auth.userJson',
  roles: 'auth.roles',
  pushToken: 'push.expoToken',
  favoriteProducts: 'favs.products',
  favoriteProperties: 'favs.properties',
} as const;

export const SECURE_KEYS = {
  authToken: 'auth.token',
  refreshToken: 'auth.refreshToken',
} as const;

export const secure = {
  async set(key: string, value: string) {
    await SecureStore.setItemAsync(key, value);
  },
  async get(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async remove(key: string) {
    await SecureStore.deleteItemAsync(key);
  },
};

// Re-export the bare-bones API surface of storage that callers should use.
// MMKV v4 uses `remove(key)` to delete a single key (not `delete(key)`).
