# Pack: i18n

Lean localization with **no heavy library**: device-locale detection, **typed** string catalogs
(missing keys are a compile error), `t()` with `{placeholder}` interpolation, **RTL** handling, and a
persisted user override. **Key-free.** Primitive — no route.

## What you get

- `catalogs.ts` — `en` is the source of truth; `fr` and `ar` are typed to match it exactly. Add a
  language by adding one typed entry; add a string by adding the key to `en` first.
- `I18nProvider` + `useTranslation()` — `const { t, locale, setLocale } = useTranslation()`.
- `i18n.ts` — `deviceLocale()`, `translate()`, `isRtl()`, `applyDirectionForLocale()`.

## Install

```
/add-feature i18n
npx expo install expo-localization
```

Wire it:

```tsx
// src/app/_layout.tsx
<I18nProvider><Stack /></I18nProvider>

// anywhere
const { t, setLocale } = useTranslation();
<AppText>{t('greeting.hello', { name: 'Achraf' })}</AppText>
<Button label={t('common.save')} onPress={() => setLocale('fr')} />
```

## Notes

Keys are checked against the `en` catalog, so a typo or a missing translation fails the build instead
of shipping a raw key to users. **RTL** (e.g. Arabic) flips the native layout via `I18nManager`, which
only fully applies after a reload — call `applyDirectionForLocale` early and prompt a restart when it
returns `true`. If you later need plurals/ICU formatting at scale, you can swap the catalog layer for
`i18next` behind the same `useTranslation` surface.
