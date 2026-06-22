# Pack: app-lifecycle

Remote control over your shipped app: a **force-update / min-version gate**, **maintenance mode**,
and a **well-timed in-app review prompt** — all driven by one public Supabase config row you edit
from the dashboard. Pure store-readiness. **Key-free.** Primitive — no route of its own.

## What you get

- `useAppGate()` — reads the remote config, compares it to this native build, returns
  `'ok' | 'update-available' | 'update-required' | 'maintenance'`. **Fails open** so a backend
  hiccup never bricks the app.
- `LifecycleGate` — wrap your routes: hard-blocks on maintenance / update-required (with a
  store deep link), passes through otherwise.
- `maybeAskForReview()` — call after a positive moment; only prompts once enough good events have
  happened and not again for the same version (the OS rate-limits too).
- `supabase/0010_app_config.sql` — single public-read `app_config` row (min/latest build,
  maintenance flag + message, store URLs).

## Install

```
/add-feature app-lifecycle
npx expo install expo-application expo-store-review expo-linking
# apply the migration, then set values in the dashboard:
supabase db reset
```

Wire it:

```tsx
// src/app/_layout.tsx
<LifecycleGate>
  <Stack />
</LifecycleGate>

// after a win, e.g. user finished onboarding or completed a task:
await maybeAskForReview();
```

## Why it helps with the stores

A **force-update** path lets you retire a buggy build instead of waiting for everyone to update on
their own — and reviewers like seeing a graceful "please update" rather than a crash. The review
prompt fired at the right time (not on cold launch) is both better UX and aligns with Apple's
guidance. Edit `min_supported_build` / `maintenance` live without shipping a new binary.
