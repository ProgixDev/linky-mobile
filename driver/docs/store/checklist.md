---
id: store-checklist
read-when: Auditing a build before submission, or building the /store-readiness skill (Phase 6) which cites these rule IDs.
owns: The queryable store-readiness rule catalog (Apple + Google) with severity, how-to-verify, and which rules `npm run store:check` automates.
---

# Store-readiness checklist (rule catalog)

Severity: **P1** will-be-rejected · **P2** likely-rejected · **P3** polish. "Auto" = checked by
`scripts/check-store-readiness.mjs` (`npm run store:check`); "manual" = human / `/store-readiness`
skill review. Rationale + guideline numbers: [`apple-app-review.md`](apple-app-review.md),
[`google-play.md`](google-play.md).

`id | sev | store | rule | how to verify | auto?`

```
STORE-APL-2.1-COMPLETE | P1 | apple  | No crashes, no placeholders/"coming soon", working URLs/buttons | Launch on device; check every screen/button | auto(copy) + manual
STORE-APL-2.1-DEMO     | P1 | apple  | Demo account + live backend provided in review notes if login exists | App Store Connect review notes | manual
STORE-APL-2.3-META     | P1 | apple  | Screenshots/description match the real app; name <=30; specific notes; no keyword stuffing | Compare store assets vs build | manual
STORE-APL-2.5.2-SELF   | P1 | apple  | App is self-contained; does not download/execute code that changes functionality | Review any remote-code/eval paths | manual
STORE-APL-4.2-MINFUNC  | P1 | apple  | More than a web wrapper; real native utility | Launch; confirm native features | manual
STORE-APL-4.3-UNIQUE   | P1 | apple  | Differentiated vs existing/sibling apps; not a cosmetic re-skin; one Bundle ID/concept | Originality review (see below) | auto(placeholders) + manual
STORE-APL-4.8-SIWA     | P2 | apple  | If social login offered, also offer Sign in with Apple | Inspect auth screen | manual
STORE-ACCT-DELETE      | P1 | both   | In-app account-deletion path exists (+ web URL for Google) | /account route + delete-account function present | auto + manual
STORE-APL-5.1.1-NOWALL | P2 | apple  | No forced login for features that don't need an account | Review gating | manual
STORE-APL-5.1.1-POLICY | P1 | apple  | Privacy policy linked in-app + on product page | Check links resolve | manual
STORE-APL-5.1.1-STRINGS| P1 | apple  | Tailored NSxxxUsageDescription for each permission used (no boilerplate, no unused perms) | Inspect app.config ios.infoPlist | auto(presence) + manual
STORE-APL-PRIVMANIFEST | P1 | apple  | ios.privacyManifests declares required-reason APIs (+ SDK reasons) | app.config check; ASC upload passes | auto + manual
STORE-APL-LABELS       | P1 | apple  | Privacy Nutrition Labels match actual + SDK behaviour | Cross-check declared vs behaviour | manual
STORE-APL-EXPORT       | P2 | apple  | usesNonExemptEncryption answered | app.config ios.config | auto
STORE-APL-3.1.1-IAP    | P1 | apple  | Digital goods via IAP; working Restore Purchases | Test purchase + restore | manual
STORE-APL-3.1.2-SUBS   | P1 | apple  | Subs >=7d; paywall has price + EULA + Privacy + auto-renew disclosure | Inspect paywall | manual
STORE-GP-DATASAFETY    | P1 | google | Data safety form complete + matches app/SDK | Compare declarations vs flows | manual
STORE-GP-PERMS         | P1 | google | Minimal permissions; sensitive ones justified w/ video demo; extras stripped | Audit manifest + blockedPermissions | auto(extras) + manual
STORE-GP-TARGETAPI     | P1 | google | targetSdkVersion >= 35 (>=36 ~2026-08) | expo-build-properties value | auto
STORE-GP-BILLING       | P1 | google | Play Billing for in-app digital goods | Confirm billing lib | manual
STORE-GP-DELETE-WEB    | P1 | google | Web account-deletion URL declared in Data safety | Verify URL loads | manual
STORE-IDENTITY         | P1 | both   | App identity is real, not template placeholders (name/slug/bundle id/scheme/icon) | app.config not com.yourcompany/skeleton; real icons | auto
STORE-METADATA-LINKS   | P2 | both   | Support URL + privacy URL set and reachable | Check store listing | manual
```

## The 4.3 originality gate (manual, but decisive)

Because the skeleton produces structurally similar apps, **shipping a re-skin will be
rejected**. Before submission confirm the app has: a distinct **name + bundle id + scheme +
icon + brand**, distinct **copy/microcopy**, and at least one **differentiating feature or
genuinely unique core experience** — not just different colors/content. The `/store-readiness`
skill (Phase 6) asks for the one-sentence differentiator and flags template leftovers.

## What `npm run store:check` automates

`scripts/check-store-readiness.mjs` flags (production builds especially): placeholder copy
("coming soon"/"lorem"/"TODO"/"FIXME"/"tab one") in shipped screens; leftover template identity
(`com.yourcompany`, slug/scheme `skeleton`, default API URL); a missing account-deletion route or
function; a missing/empty privacy manifest; and missing encryption/target-SDK config. It is a
**pre-submission gate** (`npm run store:check`), not part of `npm run verify` (the skeleton itself
legitimately carries placeholder identity until you brand a real app).
