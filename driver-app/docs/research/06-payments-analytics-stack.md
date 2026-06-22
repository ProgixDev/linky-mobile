---
id: research-payments-analytics-stack
read-when: Implementing Phase 2/3/6 — wiring payments, analytics, and crash reporting. Resolves the parking-lot stack decision.
owns: The recommended stack (RevenueCat + Supabase + PostHog + Sentry) with rationale + Expo caveats.
---

# Payments / Analytics / Crash Stack for Expo (SDK 56) — 2025–2026

**Bottom line:** **RevenueCat (payments) + Supabase Edge Functions (entitlement store) + PostHog
(analytics) + Sentry (crash/error).** All first-class in the Expo toolchain, all with generous free
tiers, and **PostHog + Sentry are ATT-free by default** — the skeleton avoids the IDFA/ATT prompt
entirely, minimizing review friction.

## 1. Payments — RevenueCat (default)

- Wraps StoreKit 2 + Play Billing + Web Billing; single cross-platform source of truth for entitlements; remotely-configurable paywalls/offerings. ([Expo IAP](https://docs.expo.dev/guides/in-app-purchases/), [RevenueCat Expo](https://www.revenuecat.com/docs/getting-started/installation/expo))
- Pricing: **free ≤ $2,500 Monthly Tracked Revenue, then 1% of MTR** — zero cost until an app earns real money (ideal for a template cloned across many apps).
- Expo: official config plugin + CNG; **needs an EAS dev build** for real purchases (Expo Go = "Preview API Mode" mocks).
- **Escape hatch:** `expo-iap` (OpenIAP, no third-party backend, no %). **Do NOT use** the deprecated `expo-in-app-purchases`; `react-native-iap` dropped Expo support in v15.

## 2. Compliance / entitlement-as-truth

- **Restore button mandatory (Apple 3.1.1)** — missing/broken Restore is a common rejection.
- StoreKit 2 transactions are Apple-signed JWS (verify via App Store Server API); Google RTDN only signals change → call Play Developer API for truth. RevenueCat abstracts both.
- **Never trust the client** — entitlements are spoofable; enforce server-side (RevenueCat Trusted Entitlements / Apple JWS).
- Webhooks deliver **at-least-once** → make handlers **idempotent** (dedupe on event `id` / `messageId` / `notificationUUID`); re-fetch authoritative state before granting/revoking.

## 3. Payments → Supabase pattern

RevenueCat webhook → **Supabase Edge Function (`verify_jwt=false`)** → verify the **Authorization header secret** (RevenueCat doesn't sign bodies; constant-time compare; store in Supabase secrets) → upsert entitlement row → gate features with **RLS** (client RLS SELECT-only; only the webhook/service_role writes). Stripe (web billing) signs properly → verify `Stripe-Signature` against the raw body.

## 4. Analytics — PostHog (default)

- The only option that works in **Expo Go** for core analytics (pure-JS SDK); open-source/self-hostable; EU hosting; all-in-one (analytics + flags + A/B + session replay + funnels); most generous free tier (1M events/mo).
- Session replay (mobile RN, GA) can be added later via plugin + dev build.
- vs Amplitude (native, no Expo Go) / Firebase (native, IDFA-free variant needed).

## 5. Crash/error — Sentry (default)

- **`@sentry/react-native`** (the `sentry-expo` package is deprecated, merged at SDK 50) with the `/expo` config plugin; `npx @sentry/wizard@latest -i reactNative` wires it.
- JS errors work in Expo Go; **native crash capture needs a dev/EAS build**.
- **Source maps:** automatic on EAS Build (`SENTRY_AUTH_TOKEN` as EAS secret); **manual on OTA** (`npx sentry-expo-upload-sourcemaps dist` after `eas update`).
- One SDK covers JS + native + tracing + session replay (GA Jan 2025).

## 6. Privacy / store implications

- **ATT only needed if you "track" or access IDFA.** Use IDFV / random app ID, never link AdSupport, never fingerprint → **no ATT prompt**.
- **PostHog** removed IDFA → no ATT. **Sentry** declares all data Tracking=false, Linked=false → no ATT. → this stack avoids the prompt entirely.
- **Privacy manifests:** ship one aggregated `ios.privacyManifests` block (Sentry needs CA92.1/35F9.1/C617.1 + Expo-package reasons). Set Sentry `sendDefaultPii:false` + anonymize IP. Fill Play Data Safety + App Privacy labels marking all data "not used to track."

## 7. Recommended combined stack

| Layer             | Choice                                   | Why                                                                                           |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| Payments          | **RevenueCat**                           | Expo-recommended; server validation + cross-platform entitlements + webhooks; free ≤$2.5K MTR |
| Entitlement store | **Supabase Edge Function → table → RLS** | Verify header secret → upsert → gate with RLS; never trust client                             |
| Analytics         | **PostHog**                              | Only Expo-Go-friendly; ATT-free; self-host/EU; all-in-one; generous free tier                 |
| Crash/error       | **Sentry** (`@sentry/react-native`)      | Non-deprecated Expo path; JS+native+tracing+replay; auto EAS source maps; ATT-free            |

## Expo setup caveats (document in skeleton)

1. All four need an **EAS dev build** for full native functionality (only PostHog core + Sentry JS work in Expo Go).
2. Sentry source maps auto on EAS Build, **manual on OTA**.
3. RevenueCat webhook auth = Authorization header only (no body signing) → HTTPS + high-entropy secret + idempotent handlers.
4. Make all webhook handlers idempotent; re-fetch authoritative state before entitlement changes.
5. Aggregate `ios.privacyManifests`; Sentry `sendDefaultPii:false`; gate analytics behind opt-in consent.
