// Phase I.1 — i18n init for four selectable languages: French (base), English
// (drafted), Pular and Sousou (key-aligned skeletons whose values are the
// French source string — the client's translators fill them in via the CSV
// round-trip in scripts/i18n-export-csv.mjs + scripts/i18n-import-csv.mjs).
//
// fallbackLng: 'fr' guarantees no raw key and no broken screen even if a
// translator misses a value. Pular and Sousou are custom language codes
// (no ISO-mapped resource bundles), so we register them explicitly.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { storage, STORAGE_KEYS } from '../lib/storage';
import fr from './locales/fr.json';
import en from './locales/en.json';
import pular from './locales/pular.json';
import sousou from './locales/sousou.json';

export const SUPPORTED_LOCALES = ['fr', 'en', 'pular', 'sousou'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

function isSupported(code: string | undefined | null): code is Locale {
  return !!code && (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

// Resolution order on cold start:
//   1. Persisted user pref (MMKV) — only if it's one of the four codes.
//   2. Device locale via expo-localization — only if it maps to one of ours.
//   3. French.
//
// We DON'T watch the device locale at runtime: once the user picks a language,
// it sticks. The Langue screen flips it via usePrefs.setLanguage(), which
// also calls i18n.changeLanguage() to re-render every component using
// useTranslation() live.
function resolveInitialLocale(): Locale {
  const persisted = storage.getString(STORAGE_KEYS.language);
  if (isSupported(persisted)) return persisted;

  const device = Localization.getLocales()[0]?.languageCode ?? null;
  if (isSupported(device)) return device;
  return 'fr';
}

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    pular: { translation: pular },
    sousou: { translation: sousou },
  },
  lng: resolveInitialLocale(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  // i18next v23+ uses CLDR plural categories by default ; explicit v4 keeps
  // the *_one / *_other / *_zero key scheme readable in the JSON.
  compatibilityJSON: 'v4',
  returnNull: false,
});

export default i18n;
