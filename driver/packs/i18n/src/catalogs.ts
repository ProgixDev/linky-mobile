/**
 * String catalogs. `en` is the source of truth — every other locale is
 * type-checked to provide exactly the same keys (see Catalog type). Use {name}
 * style placeholders; t() interpolates them.
 *
 * Add a language: add a new entry typed `Catalog`. Add a string: add the key to
 * `en` first, then TypeScript will require it everywhere.
 */
export const en = {
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.retry': 'Retry',
  'auth.signIn': 'Sign in',
  'auth.signOut': 'Sign out',
  'greeting.hello': 'Hello, {name}',
} as const;

export type TranslationKey = keyof typeof en;
export type Catalog = Record<TranslationKey, string>;

export const fr: Catalog = {
  'common.ok': 'OK',
  'common.cancel': 'Annuler',
  'common.save': 'Enregistrer',
  'common.retry': 'Réessayer',
  'auth.signIn': 'Se connecter',
  'auth.signOut': 'Se déconnecter',
  'greeting.hello': 'Bonjour, {name}',
};

export const ar: Catalog = {
  'common.ok': 'حسناً',
  'common.cancel': 'إلغاء',
  'common.save': 'حفظ',
  'common.retry': 'إعادة المحاولة',
  'auth.signIn': 'تسجيل الدخول',
  'auth.signOut': 'تسجيل الخروج',
  'greeting.hello': 'مرحباً، {name}',
};

export const catalogs = { en, fr, ar } as const;
export type LocaleCode = keyof typeof catalogs;

/** Locales that render right-to-left. */
export const RTL_LOCALES: LocaleCode[] = ['ar'];
