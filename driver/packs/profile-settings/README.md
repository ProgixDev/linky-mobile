# Pack: profile-settings

Profile (view + edit) wired to the `profiles` table, plus a local **settings** store and screens.
Logic-first, **key-free**; pairs with the skeleton's existing `/account` screen (sign out + delete).

## What you get

- **Migration** (`supabase/0010_profile_extras.sql`): adds `avatar_url` + `bio` to `profiles`
  (RLS from Phase 2 already scopes them to the owner).
- `data/profile-repo.ts` — `getMyProfile()`, `updateProfile(update)` (Zod-validated, RLS-enforced).
- `useProfile()` → `{ profile, loading, error, save, refresh }`.
- `useSettingsStore` — local prefs (theme, push/email notifications, reduce-motion), persisted with
  validated rehydration.
- `ProfileScreen`, `EditProfileScreen`, `SettingsScreen` — **placeholder** screens proving it.

## Install

```
/add-feature profile-settings
# apply supabase/0010_profile_extras.sql into supabase/migrations/, then:
supabase db reset
```

Requires the **auth** from Phase 2. Use:

```ts
const { profile, save } = useProfile();
await save({ display_name: 'Achraf', bio: 'Builder.' });
const reduceMotion = useSettingsStore((s) => s.reduceMotion);
```

## Avatars

Add a **private Supabase Storage bucket** with a per-user folder policy + short-lived signed URLs
(copy the storage pattern in `docs/research/03-supabase-security.md`), upload the image, and store
the URL in `profiles.avatar_url`.

## Screens map

- **Profile** → `ProfileScreen` (read) + `EditProfileScreen` (write).
- **Settings** → `SettingsScreen` (prefs) — keep the skeleton's `/account` for sign-out + the
  required account deletion. The design pass styles all of them.
