---
id: store-apple
read-when: Before submitting an iOS build, configuring IAP/subscriptions, privacy, or auth — or when an App Review rejection cites a guideline number.
owns: Apple App Review rules that bite apps like ours, with exact guideline numbers and how the skeleton complies.
---

# Apple App Review — rules that get apps like ours rejected

Distilled from the App Review Guidelines + the 2024 Transparency Report (7.77M reviewed,
1.93M rejected; most rejections are fixable). Evidence + sources:
[`docs/research/02-store-compliance.md`](../research/02-store-compliance.md) and the lived-experience
view in [`docs/research/07-community-sentiment.md`](../research/07-community-sentiment.md).
The enforceable checklist is [`checklist.md`](checklist.md); the steps are
[`submission-runbook.md`](submission-runbook.md).

> **Why this is now existential.** Apple is actively rejecting AI/"vibe-coded" apps (2026):
> an ~84% submission surge, longer review, and updates blocked under **2.5.2** /
> **License 3.3.1(B)**. Their line: building with AI is fine, but not apps where _"AI did
> nearly all the work and no experienced developer reviewed the result."_ The bar is **"looks
> and behaves like a human professional shipped it"** — complete, differentiated, real backend.

## The rejections to design against

- **2.1 App Completeness** — final build, working URLs, **no placeholders / "coming soon" /
  dead buttons**, a working **demo account** + live backend if login is required. #1 by volume.
- **2.3.x Accurate Metadata** — screenshots/description match the actual app; **specific** review
  notes (generic = rejected); name ≤30 chars; no keyword stuffing.
- **2.5.2 Self-contained** — the app may not download or execute code that changes its
  features/functionality. (This is the guideline behind the vibe-coding crackdown.)
- **4.0 / 4.2 / 4.2.2** — finished, HIG-aligned UI; more than a web wrapper; not primarily
  marketing/links. **4.2.6** — template/generator apps must be submitted by the content owner.
- **4.3 Spam / clone** — must be meaningfully unique vs existing apps (function, design, concept);
  one Bundle ID per concept (variants via IAP). **Cosmetic re-skins are rejected.** Because the
  skeleton produces structurally similar apps, **each shipped app needs distinct branding, copy,
  feature set, and ideally unique core functionality.** Never resubmit a 4.3-flagged app from a
  different developer account (→ permanent removal).
- **4.8 Login Services** — if you offer social/third-party login for the primary account, also
  offer a privacy-preserving equivalent (Sign in with Apple).
- **5.1.1(v) Account Sign-In** — no forced login for non-account features; **in-app account
  deletion is mandatory** if accounts exist. (Skeleton: `/account` + `delete-account` Edge Function.)
- **5.1.1(i)/(ii)** — privacy policy linked in-app + on the product page; **tailored**
  `NSxxxUsageDescription` strings (generic boilerplate is rejected; an unused permission too).
- **5.1.2(i) ATT** — permission required before tracking/IDFA; can't gate functionality on it or
  incentivize it. _(Our default stack — PostHog + Sentry — is ATT-free, so we ship no ATT prompt.)_

## Privacy machinery (enforced at App Store Connect upload, since 2024-05-01)

- **`PrivacyInfo.xcprivacy`** must declare required-reason APIs + tracking. The skeleton sets
  `ios.privacyManifests` in `app.config.ts` (Expo writes the manifest at prebuild). When you add
  an SDK, copy its required reasons from `node_modules/<pkg>/ios/PrivacyInfo.xcprivacy`.
- **Third-party SDK manifests + signatures** required for listed SDKs (Firebase, etc.).
- **Privacy Nutrition Labels** must match actual + SDK behaviour.

## Payments (3.1)

- **3.1.1** — digital goods/subscriptions use **Apple IAP**; a working **Restore Purchases** is
  required. (US storefront may add external-payment links per the 2025 rulings.)
- **3.1.2 Subscriptions** — ≥7 days, cross-device; paywall shows title/length/price + functional
  **Terms (EULA) + Privacy** links + auto-renew disclosure; functional at review.
- **3.1.3(e)** — physical goods/services consumed outside the app must NOT use IAP.
- Skeleton stack: **RevenueCat** (wraps StoreKit 2); entitlement is server-owned
  (`subscriptions` table + webhook). See [`../architecture/backend.md`](../architecture/backend.md).

## Expo config the skeleton already sets

`app.config.ts`: `ios.config.usesNonExemptEncryption = false`, `ios.privacyManifests`,
`expo-build-properties` target SDK; usage strings + ATT are intentionally absent until a
feature needs them. Run `npm run store:check` before every submission.
