# Pack: analytics

Product analytics with **PostHog**, behind a **typed event layer**. Privacy-first: **no IDFA / no
App Tracking Transparency prompt**, and a PII guard that strips sensitive properties. **No-ops
without a key**, so dev and tests stay clean.

## What you get

- `analytics.ts` — `initAnalytics`, `capture` (typed), `identify`, `resetAnalytics`. No key → no-op.
- `model/events.ts` — the **allow-list** of events and their property types. You can only fire
  declared events; free-form strings are not allowed.
- `AnalyticsProvider` + `useAnalytics()` — wrap the app once, then `track('signed_in', { method })`.
- `useScreenTracking()` — auto-fires `screen_viewed` on every route change (expo-router).

## Install

```
/add-feature analytics
npx expo install posthog-react-native expo-file-system expo-application expo-device expo-localization
```

Add the env keys to `src/shared/lib/env.ts` (client schema) and your `.env`:

```
EXPO_PUBLIC_POSTHOG_KEY=phc_xxx          # publishable project key (not a secret)
EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com   # optional; defaults to US cloud
```

Wrap the app and turn on screen tracking:

```tsx
// src/app/_layout.tsx
<AnalyticsProvider>
  {/* call useScreenTracking() in a child inside the provider */}
  <Stack />
</AnalyticsProvider>
```

## Privacy & store-readiness

PostHog here is **ATT-free**: it does not collect the advertising identifier, so you do **not** need
the App Tracking Transparency prompt (see `docs/research/06-payments-analytics-stack.md`). The event
catalog is typed and PII-scrubbed — **identify with the auth uid, never an email**, and never pass
secrets/tokens as properties (forbidden keys are dropped automatically). Declare data collection
honestly in the App Privacy questionnaire and `PrivacyInfo.xcprivacy`.
