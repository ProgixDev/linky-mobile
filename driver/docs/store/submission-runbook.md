---
id: store-submission-runbook
read-when: Preparing an actual App Store / Play submission for an app built on this skeleton.
owns: The step-by-step pre-submission process. Pairs with the rule catalog in checklist.md.
---

# Submission runbook

Run this before every store submission. Rule IDs reference [`checklist.md`](checklist.md).

## 0. Brand the app (do this once, first)

The skeleton ships with placeholder identity on purpose. A real submission must replace it
(STORE-IDENTITY, STORE-APL-4.3-UNIQUE):

- `app.config.ts`: real `name`, `slug`, `scheme`, iOS `bundleIdentifier` / Android `package`
  (not `com.yourcompany.*`), and real `icon` / splash / adaptive-icon assets.
- A genuine differentiator — distinct features, copy, and brand, not a recolor.

## 1. Pre-flight (automated)

```
npm run store:check     # placeholder copy, template identity, deletion path, manifest, target SDK
npm run verify          # lint + types + tests + secrets
npm run secrets:scan    # gitleaks (optional binary)
```

Fix every P1 before continuing.

## 2. Privacy & permissions

- iOS: confirm `ios.privacyManifests` covers every installed SDK's required-reason APIs
  (STORE-APL-PRIVMANIFEST). Add tailored `NSxxxUsageDescription` only for permissions you use
  (STORE-APL-5.1.1-STRINGS). Fill the **Privacy Nutrition Labels** to match real behaviour.
- Android: complete the **Data safety form** (incl. SDK data) (STORE-GP-DATASAFETY); justify any
  sensitive permission with the declaration form + video demo; strip extras via
  `android.blockedPermissions` (STORE-GP-PERMS).
- Both: set the **privacy policy URL** and **support URL** (STORE-APL-5.1.1-POLICY).

## 3. Accounts & payments

- Verify the in-app **account deletion** path works (`/account` → `delete-account`), and for
  Google publish + declare the **web deletion URL** (STORE-ACCT-DELETE, STORE-GP-DELETE-WEB).
- If you sell digital goods: IAP/Play Billing wired, **Restore Purchases** works, paywall shows
  price + EULA + Privacy + auto-renew disclosure (STORE-APL-3.1.1/3.1.2).
- If you offer social login, add **Sign in with Apple** (STORE-APL-4.8).

## 4. Completeness & metadata

- No placeholders / "coming soon" / dead buttons anywhere; every screen has real content and
  real (empty/loading/error) states (STORE-APL-2.1-COMPLETE).
- Backend is **live** during review; provide a **demo account** in the review notes with clear,
  specific steps (STORE-APL-2.1-DEMO, STORE-APL-2.3-META).
- Screenshots/description match the build; app name ≤30 chars; no keyword stuffing.

## 5. Build & submit

```
npx expo install --fix
eas build --platform all --profile production
eas submit --platform all --profile production
```

Set `EXPO_PUBLIC_*` via EAS env; secrets (RevenueCat webhook, etc.) via `supabase secrets set` —
never in the bundle (`npm run store:check` + `npm run secrets:check` guard this).

## 6. External pre-launch audit (recommended)

Run an independent scan of your live Supabase project (e.g. SupaExplorer's free audit) to confirm
no table is exposed and no secret key leaked — a sanity check on the agent's own work, per
[`docs/research/07-community-sentiment.md`](../research/07-community-sentiment.md).
