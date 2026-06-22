import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { appStorage } from '@/shared/lib/storage';

import { type LocaleCode, type TranslationKey } from './catalogs';
import { applyDirectionForLocale, deviceLocale, translate } from './i18n';

const LOCALE_KEY = 'i18n.locale';

type I18nValue = {
  locale: LocaleCode;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  setLocale: (locale: LocaleCode) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

/** Wrap the app once. Loads the saved locale (or the device's) and applies RTL. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>('en');

  useEffect(() => {
    void (async () => {
      const saved = (await appStorage.get(LOCALE_KEY)) as LocaleCode | null;
      const initial = saved ?? deviceLocale();
      applyDirectionForLocale(initial);
      setLocaleState(initial);
    })();
  }, []);

  const setLocale = useCallback((next: LocaleCode) => {
    void appStorage.set(LOCALE_KEY, next);
    applyDirectionForLocale(next); // may require a reload to fully apply RTL
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within <I18nProvider>');
  return ctx;
}
