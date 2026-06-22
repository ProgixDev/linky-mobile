---
id: research-store-compliance
read-when: Implementing Phase 3 (store compliance) — building the Apple/Google rule base and the /store-readiness audit skill.
owns: Verified Apple/Google rules with exact guideline numbers, top rejection triggers, the machine-readable rule list, Expo config specifics.
---

# App Store & Google Play Rejection-Avoidance (2025–2026)

For a skeleton shipping apps with auth, payments/subscriptions, and sensitive data. Exact
guideline numbers given where they exist.

## Numbering caveats (these trip people up)

- Marketing/web-clippings = **4.2.2**. No-forced-login + account-deletion = **5.1.1(v)** (NOT 4.2.3).
- Template/no-code apps = **4.2.6**. ATT/tracking = **5.1.2(i)**. Privacy policy + purpose strings = **5.1.1(i)/(ii)**.
- Physical goods outside app = **3.1.3(e)**. 2025 US court changes touch **3.1.1, 3.1.1(a), 3.1.3, 3.1.3(a)**.
- Privacy manifest / required-reason API machinery is enforced at **App Store Connect upload** (since May 1, 2024), not in the Review Guidelines.

## Apple — most common rejections (2024 Transparency Report: 7.77M reviewed, 1.93M rejected)

By volume: **Performance (2.1) ~1.24M**, Legal (5.x) ~446K, Design (4.x) ~378K. 295K rejected apps later approved after fixes — most are fixable. ([guidelines](https://developer.apple.com/app-store/review/guidelines/), [report](https://www.macrumors.com/2025/05/30/app-store-2024-transparency-report/))

- **2.1 Completeness** — final builds, working URLs, **no placeholders/"coming soon"**, demo account + live backend if login exists. #1 by volume.
- **2.3.x Metadata** — screenshots/description match real features; specific review notes; name ≤30 chars; no keyword stuffing.
- **4.0 / 4.2 / 4.2.2** — finished UI; more than a web wrapper; not primarily marketing/links.
- **4.3 Spam / 4.2.6 Template** — unique function/design vs existing apps; one Bundle ID per concept; variants via IAP. Cosmetic re-skins WILL be rejected.
- **4.8 Login Services** — if social login is offered, also offer a privacy-preserving equivalent (Sign in with Apple).
- **5.1.1(v)** — no forced login for non-account features; **in-app account deletion mandatory**.
- **5.1.2(i) ATT** — explicit permission before tracking/IDFA; can't gate functionality on the prompt; can't incentivize it.

## Apple privacy

- **PrivacyInfo.xcprivacy** manifest: collected data types, required-reason APIs (`NSPrivacyAccessedAPITypes`), `NSPrivacyTracking`, tracking domains. **ASC rejects uploads** missing required-reason declarations since **May 1, 2024**.
- Required-reason API reason codes (examples): UserDefaults CA92.1; SystemBootTime 35F9.1; FileTimestamp C617.1; DiskSpace E174.1.
- **Third-party SDK manifests + signatures** required for listed SDKs (Firebase, OneSignal, Lottie, hermes, etc.).
- **Nutrition labels** must match actual + partner/SDK behavior. Privacy Policy URL required.
- **ATT:** `NSUserTrackingUsageDescription` required (app may crash without it); IDFA returns zeros without consent; pre-prompt explainers allowed if transparent.

## Apple IAP / payments

- **Must use IAP (3.1.1):** feature unlocks, subscriptions, in-game currency, tips, digital content. **Restore mechanism required.**
- **Must NOT (3.1.3(e)):** physical goods/services consumed outside the app.
- **Subscriptions (3.1.2):** ≥7 days, cross-device, paywall shows title/length/price + functional **Terms (EULA) + Privacy** links + auto-renew disclosure.
- **2025 changes (US storefront only, since May 1, 2025):** external payment links allowed with no entitlement; later narrowed Dec 2025 (Ninth Circuit allows "reasonable" commission). EU DMA = Core Technology Commission 5%.

## Google Play

- **Data safety form** mandatory (incl. third-party SDK collection); mismatch → removal.
- **Permissions minimization** — sensitive perms need a declaration form + **video demo** + core-function justification (blocks ALL publishing until resolved): SMS/Call Log, background location, MANAGE_EXTERNAL_STORAGE, QUERY_ALL_PACKAGES, AccessibilityService.
- **Target API:** since **Aug 31, 2025 → API 35+**; existing apps need API 34+; expect **API 36 ~Aug 2026**.
- **Play Billing** for in-app digital goods (US post-Epic: alternative billing allowed, deadline Jan 28, 2026).
- **Account deletion:** BOTH in-app path AND a web URL declared in Data safety (usable without reinstall). Effective May 31, 2024.

## Account deletion — exact requirements

- **Apple 5.1.1(v)** (since June 30, 2022): full account+data deletion **from within the app**; Sign in with Apple → call REST API to revoke tokens. Global.
- **Google** (answer/13327111): in-app path + Play-Console-declared web URL.

## The 4.3 "spam/clone" problem — critical for a skeleton

Because the skeleton produces structurally similar apps, each shipped app needs **distinct branding, copy, feature set, and ideally unique core functionality** — not a re-skin. Never resubmit a 4.3-flagged app from a different account (escalates to permanent removal).

## Expo config specifics (required for approval)

- **Privacy manifest:** `ios.privacyManifests` in app config (EAS prebuild writes `PrivacyInfo.xcprivacy`); copy required reasons from `node_modules/<pkg>/ios/PrivacyInfo.xcprivacy`.
- **ATT:** `expo-tracking-transparency` plugin with `userTrackingPermission` (sets `NSUserTrackingUsageDescription`).
- **iOS usage strings:** `ios.infoPlist` tailored (default boilerplate gets rejected); Info.plist changes need a new build (no OTA).
- **Android perms:** `android.permissions` minimal; `android.blockedPermissions` strips library-added extras.
- **Target SDK:** `expo-build-properties` (`compileSdkVersion`/`targetSdkVersion`).

## Machine-readable rule list (seed for `references/store-checklist.md`)

`id | store | requirement | how-to-verify`

```
APL-2.1-COMPLETE   | apple  | No crashes/placeholders, working URLs, demo account + live backend | Launch clean device; check links/buttons; ASC notes have demo creds
APL-2.3-METADATA   | apple  | Screenshots/desc match; specific notes; name<=30; no keyword stuffing | Diff store assets vs binary
APL-4.2-MINFUNC    | apple  | Not a web wrapper; works standalone | Confirm native features; offline launch
APL-4.3-SPAM       | apple  | Unique vs existing apps; one Bundle ID/concept; variants via IAP | Compare store siblings; distinct branding/features
APL-4.8-LOGIN      | apple  | Social login => offer Sign in with Apple | Check auth screen
APL-5.1.1v-DELETE  | apple  | In-app account deletion; no forced login | Find delete flow; SIWA token revoke
APL-5.1.1-POLICY   | apple  | Privacy policy in store + app; tailored NSxxxUsageDescription | Check links + grep Info.plist
APL-5.1.1-LABELS   | apple  | Nutrition labels match actual+SDK | Cross-check declared vs behavior
APL-5.1.2-ATT      | apple  | ATT prompt + usage string if tracking; not gated/incentivized | Confirm prompt fires
APL-PRIVMANIFEST   | apple  | PrivacyInfo.xcprivacy declares required-reason APIs + tracking domains | ASC upload passes
APL-3.1.1-IAP      | apple  | Digital goods via IAP; working Restore | Test purchase + restore
APL-3.1.2-SUBS     | apple  | Subs>=7d, EULA+Privacy on paywall, auto-renew disclosure | Inspect paywall
GP-DATASAFETY      | google | Data safety form matches app+SDK | Compare declarations vs flows
GP-PERMS-MIN       | google | Minimal perms; sensitive declared w/ video demo | Audit manifest + form
GP-TARGETAPI       | google | Target API>=35 (>=36 ~Aug 2026) | Check targetSdkVersion
GP-BILLING         | google | Play Billing for digital goods | Confirm billing lib
GP-DELETE          | google | In-app deletion + web URL in Data safety | Find flow; verify URL
EXPO-PRIVMANIFEST  | both   | ios.privacyManifests set; SDK reasons copied | Check config + node_modules
EXPO-ATT           | both   | expo-tracking-transparency w/ userTrackingPermission | Check plugins
EXPO-BUILDPROPS    | android| expo-build-properties sets target/compileSdk | Check vs Play deadline
```

## Top rejection triggers (ranked)

1. Crashes/broken functionality on reviewer device (2.1)
2. Missing/non-working demo account or backend off at review (2.1)
3. Placeholder/"coming soon"/broken buttons (2.1)
4. 4.3 spam / design clone / template re-skin
5. Privacy labels/Data safety don't match actual+SDK behavior
6. Missing in-app account deletion (5.1.1(v) / Google)
7. IAP bypass — external payment for digital goods (non-US)
8. ATT prompt missing/gated/incentivized
9. Missing privacy manifest / required-reason reasons (ASC upload)
10. Thin web-wrapper (4.2)
    11–15: metadata mismatch; forced login; subscription disclosure failures; unjustified sensitive permission; missing Sign in with Apple; stale target API.

**Highest-leverage skeleton defenses:** (1) mandatory in-app account-deletion wired to the auth provider, (2) a privacy-manifest + Data-safety generator that reads installed SDKs so declarations never drift, (3) IAP-first payments with a US external-link toggle, (4) per-app differentiation enforcement. The "Apple won't say why" rejections are usually 2.1, 4.3, or 5.1.x — the three hardest to self-diagnose, which is why the audit front-loads them.
