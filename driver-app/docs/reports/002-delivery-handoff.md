# Feature report — 002 Delivery detail & QR-scan handoff

- **Spec:** [`specs/002-delivery-handoff/spec.md`](../../specs/002-delivery-handoff/spec.md) · **Plan:** [`plan.md`](../../specs/002-delivery-handoff/plan.md)
- **Branch:** `feat/002-delivery-handoff` (off `feat/driver-app`) · **Date:** 2026-06-23
- **Status:** code-complete, `npm run verify` green; on-device verification + edge-fn deploy deferred (no emulator/device/Supabase access on this Windows host)

## What shipped

A driver can now **finish** a delivery. Opening one shows its full detail — order ref,
item, the **full street address** (revealed here, unlike the list’s area-only view),
buyer name, and status. A primary action opens a QR scanner; scanning the buyer’s
on-screen order QR shows a **review**, and only an explicit **Confirm delivery** tap
releases the seller’s escrowed payment and marks the delivery delivered. A scan alone
releases nothing. Every failure is honest: a QR for another order/driver or a forged
token is rejected (nothing released), an already-completed order says so, a denied
camera permission explains how to enable it (never a dead end), and because release
moves money the confirm is online-only — offline blocks it with a reconnect/retry.

21 files, +1365/−39. Commits (T0→T13):

- `3b693df` T0 expo-camera + native config (camera permission, ADR-0009 accepted)
- `0f35b06` T1 `get-delivery` edge function (canonical backend)
- `a7ef629` T2 detail + handoff schemas · `af2edce`/`e6a3f48` T3 `parseOrderQr` (+ strict-TS hardening)
- `4d7e452` T4 `getDelivery` + `confirmHandoff` API client · `d9ae6c7` T5 `removeDelivery`
- `e9f7be3` T6 QR scanner UI · `ee8096e` T7 detail state machine · `037a7b7` T8 component tests
- `816f903` T9 route wiring · `cdd485b` T10/T12 Maestro + CUJ-003 + verify green
- `04efa39` T13 review fixes (P1s + P2s)

### Areas touched

- **Feature slice** `src/features/deliveries/` — added `lib/qr.ts`, `ui/qr-scanner.tsx`,
  `ui/delivery-detail-screen.tsx`; extended `model/schema.ts` (detail + handoff types),
  `model/store.ts` (`removeDelivery`), `lib/deliveries-api.ts` (`getDelivery`,
  `confirmHandoff`), `index.ts`; new colocated tests (`qr`, detail-screen) + extended api/store tests.
- **Backend** `app-mobile/supabase/functions/get-delivery/index.ts` (Deno; `requireUser`;
  full address + buyer name, scoped to the assigned livreur; no `scan_token`) + `config.toml`
  (`[functions.get-delivery] verify_jwt = false`, per the backend’s post-incident policy).
  `livreur-confirm-handoff` already existed (consolidated backend) — reused, not rebuilt.
- **Native config** `app.config.ts` — tailored `NSCameraUsageDescription` + `expo-camera`
  plugin (mic/`RECORD_AUDIO` disabled — QR only).
- **Routing** `src/app/delivery/[id].tsx` — placeholder replaced with `DeliveryDetailScreen`.
- **QA/docs** `.maestro/flows/handoff-cuj.yaml` (new) + `docs/quality/critical-user-journeys.md`
  (CUJ-003) + ADR-0009 accepted.

## Acceptance criteria → evidence

| AC | What it requires | Proven by | Status |
| --- | --- | --- | --- |
| AC-1 | Detail: ref, item+photo, full street address, buyer, status | `delivery-detail-screen.test.tsx` "loads and shows…"; `deliveries-api.test.ts` `getDelivery` map | ✅ unit/component |
| AC-2 | Clear scan action opens the camera scanner | `delivery-detail-screen.test.tsx` "opens the camera scanner" | ✅ component |
| AC-3 | Valid scan → review; confirm requires explicit tap (scan alone releases nothing) | `delivery-detail-screen.test.tsx` "valid scan…does NOT release until Confirm" | ✅ component |
| AC-4 | Confirm → delivered + escrow released + leaves the active list | `delivery-detail-screen.test.tsx` "confirming…drops it from the list"; `store.test.ts` `removeDelivery` | ✅ component + unit |
| AC-5 | Mismatch (wrong order/driver, forged token) → error, nothing released | `qr.test.ts` (junk/mismatch parse) + `deliveries-api.test.ts` (`INVALID_SCAN_TOKEN`/`NOT_ASSIGNED_LIVREUR`→mismatch) + screen "QR for another order" / "server-rejected token" | ✅ unit + component |
| AC-6 | Permission denied → explain + enable/Settings + retry, no dead end | `delivery-detail-screen.test.tsx` "permission denied" + "permanently-denied → Settings" | ✅ component |
| AC-7 | Offline → confirm blocked, reconnect + retry, nothing released | `deliveries-api.test.ts` (transport→`offline`) + screen "blocks confirm when offline and retries" | ✅ unit + component |
| AC-8 | Idempotent — already done → told so, no second release | `deliveries-api.test.ts` (`INVALID_STATUS`→`already_done`) + screen "already completed" | ✅ unit + component |
| AC-9 | Only the assigned driver (server-derived JWT); scan token verified server-side; full PII only for own delivery | `deliveries-api.test.ts` (request carries only orderId+token / delivery_id, no identity) + **server** `requireUser` in both edge fns + RPC token/assignment gates | ✅ client unit + server (RPC/edge — deploy/deno-check deferred) |

## Verification

- `npm run verify` — **green**: format · lint · animations:check · typecheck · **84 tests (15 suites)** ·
  docs:lint (112 md, CUJ↔Maestro sync OK) · functions:check · secrets:check.
- `/review` (multi-persona) — verdict REQUEST-CHANGES; **both P1s fixed**: failure-state CTA leak,
  and the (previously missing) Confirm single-flight guard + regression test. Cheap P2s also fixed:
  stable per-handoff idempotency key, item-image a11y label, Maestro row assertion.
- `/security-review` — **PASS, no P1s**. SEC-INPUT-001 (QR trust boundary validated + edge responses
  Zod-parsed); server-authority / SEC-LINK-002 (JWT-derived identity, no client livreur id, route
  param fetch-only + `get-delivery` scoped to `livreur_id = caller`); money action (server-RPC
  release, scan never releases, online-only, double-tap guarded + idempotent + stable key);
  SEC-SECRET-001/003 (`get-delivery` service-role server-side, **`scan_token` never returned**,
  secrets:check green); SEC-STORE-001 (full address/buyer name transient only — cache stays area-only).

## Deferred (must clear before go-live — needs macOS/device + Supabase access)

- **`/verify-ui` (T11):** Argent walk of CUJ-003 on a device — scan a real/dev QR, screenshot
  detail/scan/review/success/mismatch/offline. Camera is native (no Expo Go); **no emulator,
  simulator, or connected device exists on this Windows host**.
- **`npm run e2e:ios` (T10):** `handoff-cuj.yaml` written; needs a booted simulator + a seeded
  livreur with an active delivery.
- **Edge function:** `deno check` + deploy `get-delivery` to the shared Supabase project (with
  `verify_jwt = false` + in-function `requireUser`, as written), then a live `getDelivery` /
  `confirmHandoff` smoke test against a seeded order.

## Follow-ups (encode-lesson candidates, from review)

- **Stable idempotency keys on money POSTs:** `apiPost` defaults to a fresh key per call, so any
  retry of a money action loses replay protection. Spec 002 now threads a stable key for confirm;
  generalize via a lint rule / typed wrapper flagging money endpoints called without an explicit
  `idempotencyKey` (highest-leverage, repo-wide).
- **State-machine CTA hygiene:** the bottom-action ternary fall-through leaked the detail CTA into
  failure phases. Prefer an exhaustive `switch (phase.kind)` for a state-machine screen’s primary
  action so non-detail phases can’t inherit it.
- **Single-flight on async submit handlers:** money/destructive submit handlers need a synchronous
  ref/phase guard (not just a post-render disabled button) + a double-fire regression test.
