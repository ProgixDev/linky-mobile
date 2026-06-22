---
id: store-google-play
read-when: Before submitting an Android build, filling the Data safety form, requesting a sensitive permission, or setting the target API level.
owns: Google Play policies that bite apps like ours, and how the skeleton complies.
---

# Google Play — rules that get apps like ours rejected

Evidence + sources: [`docs/research/02-store-compliance.md`](../research/02-store-compliance.md).
Enforceable checklist: [`checklist.md`](checklist.md).

## The rules to design against

- **Data safety form** — mandatory for every app (even no-data apps), and must cover
  third-party SDK collection/sharing. A mismatch with actual behaviour → blocked updates or
  removal. _"You alone are responsible for complete and accurate declarations."_
- **Permissions minimization** — request the minimum. High-risk/sensitive permissions need a
  **Permissions Declaration Form + a video demo + core-function justification**, and they block
  ALL publishing until resolved: SMS/Call Log (must be default handler),
  `ACCESS_BACKGROUND_LOCATION`, `MANAGE_EXTERNAL_STORAGE`, `QUERY_ALL_PACKAGES`,
  `AccessibilityService`. Skeleton: strip library-added extras with `android.blockedPermissions`.
- **Target API level** — new apps + updates must target **API 35+** (since 2025-08-31; expect
  **API 36 ~2026-08**). Skeleton sets this via `expo-build-properties` (`targetSdkVersion: 35`).
- **Play Billing** — required for in-app digital goods/services (US post-Epic: alternative
  billing allowed). Physical goods/services must NOT use Play Billing.
- **Account deletion** — if accounts exist, provide BOTH an in-app deletion path AND a
  Play-Console-declared **web URL** usable without reinstalling. Skeleton: `/account` +
  `delete-account` Edge Function (in-app); publish a web deletion page + declare its URL.
- **Deceptive behavior / minimum functionality** — metadata must match real functionality; no
  crashes, broken areas, or placeholder content.

## What the skeleton sets

`expo-build-properties` target/compile SDK 35; `android.blockedPermissions` placeholder for
stripping extras; minimal default permissions. The Data safety form, the web account-deletion
page + URL, and per-app permission justifications are **per-project** — see
[`submission-runbook.md`](submission-runbook.md).
