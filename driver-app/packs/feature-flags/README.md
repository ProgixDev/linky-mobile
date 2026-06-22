# Pack: feature-flags

Remote on/off switches with **percentage rollout**, driven by a public Supabase table and cached
locally. Ship a feature dark, roll it out to 10% of users, or kill a broken one — **without an app
update**. **Key-free.** Primitive — no route.

## What you get

- `FlagsProvider` — loads flags once, caches them (instant + offline on next launch), refreshes from
  the network.
- `useFlag('key')` — boolean for the current user. Rollout is **deterministic** (stable hash of
  `uid + key`), so a user never flickers in and out of a bucket.
- `model/flag.ts` — `isFlagOn`, `bucketFor` (the bucketing math).
- `supabase/0010_feature_flags.sql` — public-read `feature_flags` (`key`, `enabled`, `rollout`).

## Install

```
/add-feature feature-flags
# apply the migration, then add rows in the dashboard:
supabase db reset
```

Use it:

```tsx
// src/app/_layout.tsx
<FlagsProvider><Stack /></FlagsProvider>

// anywhere
const newCheckout = useFlag('new_checkout');
return newCheckout ? <NewCheckout /> : <OldCheckout />;
```

## Notes

Flags are **public read** (so they evaluate before sign-in) — never put anything secret in a flag
key, description, or value; a flag is visible to anyone. To target a flag at, say, internal users,
gate on a server-side check, not a public flag. Pairs well with `app-lifecycle` (kill switch) and any
risky new feature you want to dark-launch.
