import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';

import { catalogs, en, RTL_LOCALES, type LocaleCode, type TranslationKey } from './catalogs';

/** The best supported locale for this device, falling back to English. */
export function deviceLocale(): LocaleCode {
  const codes = getLocales().map((l) => l.languageCode ?? 'en');
  const match = codes.find((c) => c in catalogs) as LocaleCode | undefined;
  return match ?? 'en';
}

/** Translate a key for a locale, interpolating {placeholders}. Falls back to en. */
export function translate(
  locale: LocaleCode,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const table = catalogs[locale] ?? en;
  let out: string = table[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return out;
}

export function isRtl(locale: LocaleCode): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * Align the native layout direction to the locale. RTL fully applies only after
 * a reload, so call this early (before first render) and reload if it changed.
 * Returns true if the direction changed.
 */
export function applyDirectionForLocale(locale: LocaleCode): boolean {
  const shouldRtl = isRtl(locale);
  if (I18nManager.isRTL !== shouldRtl) {
    I18nManager.allowRTL(shouldRtl);
    I18nManager.forceRTL(shouldRtl);
    return true;
  }
  return false;
}
