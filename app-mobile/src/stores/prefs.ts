import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../lib/storage';

export type Language = 'fr' | 'en' | 'pular' | 'sousou';

interface PrefsState {
  dataSaver: boolean;
  notifications: boolean;
  language: Language;
  // Privacy toggles — persisted so they survive an app reopen.
  privacyPersonalize: boolean;
  privacyAnalytics: boolean;
  privacyAdTracking: boolean;
  privacyProfilePublic: boolean;
  setDataSaver: (v: boolean) => void;
  setNotifications: (v: boolean) => void;
  setLanguage: (v: Language) => void;
  setPrivacyPersonalize: (v: boolean) => void;
  setPrivacyAnalytics: (v: boolean) => void;
  setPrivacyAdTracking: (v: boolean) => void;
  setPrivacyProfilePublic: (v: boolean) => void;
}

export const usePrefs = create<PrefsState>((set) => ({
  dataSaver: storage.getBoolean(STORAGE_KEYS.dataSaver) ?? false,
  notifications: storage.getBoolean(STORAGE_KEYS.notificationsEnabled) ?? true,
  language: (storage.getString(STORAGE_KEYS.language) as Language) ?? 'fr',
  privacyPersonalize: storage.getBoolean(STORAGE_KEYS.privacyPersonalize) ?? true,
  privacyAnalytics: storage.getBoolean(STORAGE_KEYS.privacyAnalytics) ?? true,
  privacyAdTracking: storage.getBoolean(STORAGE_KEYS.privacyAdTracking) ?? false,
  privacyProfilePublic: storage.getBoolean(STORAGE_KEYS.privacyProfilePublic) ?? true,
  setDataSaver: (v) => {
    storage.set(STORAGE_KEYS.dataSaver, v);
    set({ dataSaver: v });
  },
  setNotifications: (v) => {
    storage.set(STORAGE_KEYS.notificationsEnabled, v);
    set({ notifications: v });
  },
  setLanguage: (v) => {
    storage.set(STORAGE_KEYS.language, v);
    set({ language: v });
  },
  setPrivacyPersonalize: (v) => {
    storage.set(STORAGE_KEYS.privacyPersonalize, v);
    set({ privacyPersonalize: v });
  },
  setPrivacyAnalytics: (v) => {
    storage.set(STORAGE_KEYS.privacyAnalytics, v);
    set({ privacyAnalytics: v });
  },
  setPrivacyAdTracking: (v) => {
    storage.set(STORAGE_KEYS.privacyAdTracking, v);
    set({ privacyAdTracking: v });
  },
  setPrivacyProfilePublic: (v) => {
    storage.set(STORAGE_KEYS.privacyProfilePublic, v);
    set({ privacyProfilePublic: v });
  },
}));
