# Feature report — 002 Delivery detail & QR-scan handoff

- **Spec:** [`specs/002-delivery-handoff/spec.md`](../../specs/002-delivery-handoff/spec.md) · **Plan:** [`plan.md`](../../specs/002-delivery-handoff/plan.md) · **ADR:** [`0009-expo-camera-qr-scanning`](../architecture/decisions/0009-expo-camera-qr-scanning.md)
- **Branch:** `feat/002-delivery-handoff` (cut off `feat/001-assigned-deliveries` — spec 001 is not yet on `main` in this repo) · **Date:** 2026-06-23
- **Status:** code-complete; `npm run verify` green. On-device camera QA + edge-function deploy deferred (no macOS/device/dev build + no Supabase deploy access on this host).

## What shipped

The placeholder `/delivery/[id]` route is now the real **handoff flow**: open a delivery →
see its full detail (order ref, item + photo, **full street address**, buyer name, status) →
tap **Scan to confirm delivery** → scan the buyer's on-screen order QR
(`linky://order/<id>/confirm?token=<token>`) → review the matched order → tap an explicit
**Confirm delivery** → success (“delivered — payment released”); the job leaves the active
list. The whole thing is a transient `useReducer` state machine
(view → scan → review → confirm → success/error). **A scan never releases money on its own** —
only the Confirm tap calls the server, which is the sole authority on assignment, token
validity, and idempotency. Every failure is honest and recoverable: mismatch, already-done,
offline, permission-denied (never a dead end), load error.

20 files, +1702/−25. Commits:

- `1e2dc58` build(T0) — `expo-camera` + camera permission config (QR-only)
- `89fcf80` feat(T1) — `get-delivery` + `livreur-confirm-handoff` edge functions
- `b5bbdab` feat(T2–T9) — schema, QR parser, API, store, scanner, detail screen, route, tests
- `ca7a355` test(T10) — handoff Maestro flow + CUJ-003
- `f784817` fix(T13) — review findings: money-path hardening

### Areas touched

- **Feature slice** `src/features/deliveries/` — added `lib/qr.ts`, `ui/qr-scanner.tsx`,
  `ui/delivery-detail-screen.tsx`; extended `model/schema.ts` (detail + handoff types),
  `model/store.ts` (`removeDelivery`), `lib/deliveries-api.ts` (`getDelivery`,
  `confirmHandoff`), `index.ts`; tests `qr.test.ts`, `delivery-detail-screen.test.tsx`,
  extended `deliveries-api.test.ts` + `store.test.ts`.
- **Backend (Deno, deploy deferred)** `supabase/functions/get-delivery/` +
  `supabase/functions/livreur-confirm-handoff/` + `config.toml` (`verify_jwt = true` for both).
- **Native config** `app.config.ts` — tailored `NSCameraUsageDescription` + `expo-camera`
  plugin (Android `RECORD_AUDIO` disabled, no mic — QR only).
- **Routing** `src/app/delivery/[id].tsx` — placeholder → thin route rendering `DeliveryDetailScreen`.
- **QA/docs** `.maestro/flows/handoff-cuj.yaml` + CUJ-003 in `docs/quality/critical-user-journeys.md`.

## Acceptance criteria → evidence

| AC | What it requires | Proven by | Status |
| --- | --- | --- | --- |
| AC-1 | Detail shows ref, item+photo, full street address, buyer name, status | `delivery-detail-screen.test.tsx` "loads and shows …" + `deliveries-api.test.ts` getDelivery parse | ✅ unit/component |
| AC-2 | Clear scan action opens the camera once permission granted | `delivery-detail-screen.test.tsx` "opens the camera scanner" (expo-camera mocked) | ✅ component |
| AC-3 | Valid scan → review; a final explicit Confirm required (scan alone releases nothing) | `delivery-detail-screen.test.tsx` "valid scan shows a review and does NOT release until Confirm" | ✅ component |
| AC-4 | Confirm → released + success + leaves active list | `delivery-detail-screen.test.tsx` "confirming releases … drops it from the list" + `store.test.ts` `removeDelivery` | ✅ component + unit |
| AC-5 | Mismatch (other order / forged token / another driver) → error, nothing released | `qr.test.ts` (junk/other-scheme/non-uuid) + `delivery-detail-screen.test.tsx` (other-order QR + server-rejected token) + `deliveries-api.test.ts` (code→mismatch) | ✅ unit/component |
| AC-6 | Permission denied → explain + enable/Settings + retry, never a dead end | `delivery-detail-screen.test.tsx` "enable/retry" + "permanently-denied → Settings" | ✅ component |
| AC-7 | Offline → confirm blocked + reconnect/retry; nothing released offline | `deliveries-api.test.ts` (FunctionsFetchError → offline) + `delivery-detail-screen.test.tsx` "blocks confirm when offline and retries" | ✅ unit/component |
| AC-8 | Idempotent — already-done released nothing a second time | `deliveries-api.test.ts` (INVALID_STATUS/INVALID_DELIVERY_STATUS → already_done; contract table) + `delivery-detail-screen.test.tsx` "already completed" + "lost-response retry → already-done, never a second release" | ✅ unit/component |
| AC-9 | Only the assigned driver, server-authorized from the JWT; token verified server-side; full address only for own delivery | `deliveries-api.test.ts` (request carries no identity — getDelivery sends only `delivery_id`, confirm only `{order_id, scan_token}`) + edge fns `getUser()` + `.eq('livreur_id', user.id)` + RPC token/assignment gates | ✅ client unit + **server (deploy deferred)** |

## Verification

- `npm run verify` — **green**: format · lint · animations:check · typecheck · **88 tests
  (13 suites)** · docs:lint (112 md, CUJ↔Maestro sync OK) · functions:check (5 functions
  declare `verify_jwt`) · secrets:check.
- **`/review` (multi-persona, code-reviewer) → REQUEST-CHANGES, all findings resolved:**
  - **P1** (QA): a lost-response retry after a release could, on a backend that drops the
    order row, raise `*_NOT_FOUND`→`mismatch` and invite a re-attempt. Verified against the
    canonical `livreur_confirm_handoff` migration: the order row **persists** as `released`,
    so the retry raises `INVALID_STATUS`→`already_done`. Locked with a lost-response
    regression test + an exhaustive error-code→outcome contract table.
  - **P2**: confirm error card no longer surfaces raw supabase-js/transport strings (curated
    French copy or a generic fallback only).
  - **P2**: `Idempotency-Key` is now read + documented in the edge function (the canonical
    reserve-first idempotency layer keys on it; the RPC status gate is the standalone
    backstop) — no dead contract.
  - **P3**: `get-delivery` scrubs UUIDs from logs; status clamp uses
    `DeliveryStatusSchema.catch` (one source of truth); confirming state keeps the review
    Card chrome (no layout shift on the money tap).
- **`/security-review` (against [`docs/security/checklist.md`](../security/checklist.md)) → PASS, no P1s:**
  - **SEC-INPUT-001** (P1): the scanned QR is validated pre-network (`parseOrderQr`: anchored
    scheme/path, UUID check, rejects junk/other-scheme/trailing-params/non-strings), edge
    responses are Zod-parsed, and the scanned `orderId` is compared to the opened delivery
    before any confirm.
  - **SEC-LINK-002 / SEC-RLS-001 (spirit)** (P1): identity is JWT-derived server-side
    (`getUser()`); the client sends no driver id; the route `id` is fetch-only and
    `get-delivery` is scoped `livreur_id = caller`; the RPC is the authority on
    assignment/token/status.
  - **SEC-SECRET-001/003** (P1): `get-delivery` runs service-role server-side and **never
    returns `scan_token`**; no secrets in client/source; `secrets:check` green. `.env` holds
    only the public anon/publishable key.
  - **SEC-LOG-001** (P2): both edge functions redact UUIDs (`scrub`) before logging; expected
    rejections log the code only.
  - **SEC-STORE-001** (P1): the full street address + buyer name are transient (detail screen
    only) — the cached worklist stays area-only.
  - **Money action**: release is server-RPC-only; a scan never releases (explicit Confirm);
    online-only (AC-7); double-tap guarded client-side (synchronous `submitting` ref) +
    idempotent server-side + a stable per-handoff idempotency key.
  - **Watch-items:** deploy `get-delivery` and `livreur-confirm-handoff` with the canonical
    auth model (self-rolled JWT `requireUser` + `verify_jwt=false`) — see the auth caveat in
    each function header; `npm audit` highs are pre-existing (SEC-SUPPLY-001).

## Deferred (cannot complete on this host)

- **T1 deploy** — `deno check` + deploy `get-delivery` (and confirm the canonical
  `livreur-confirm-handoff`) to the shared Supabase project, then a live `functions.invoke`
  smoke test against a seeded livreur. The two functions here are modeled on this repo's
  `list-livreur-deliveries` (Supabase Auth); the **canonical Linky backend already ships
  `livreur-confirm-handoff` with a self-rolled JWT** (`requireUser`, `verify_jwt=false`) —
  prefer it, or swap the `getUser()` block per the function headers.
- **T11 `/verify-ui` (Argent) + `npm run e2e:ios`** — needs macOS + a dev build (camera is
  native, not in Expo Go) + a booted simulator + a seeded livreur with an active delivery.
  The Maestro flow covers nav + the permission-denied no-dead-end path; the live scan →
  review → confirm → release and the offline-confirm block are the Argent-only parts.
- **Local `.env`** — the harness blocks agents from writing `.env`. Create it with the four
  `EXPO_PUBLIC_*` values from `linky-mobile/driver-app/.env` (public anon/publishable key
  only) — see the project summary. Not required for `verify`/tests (env.ts has safe fallbacks).
- **T16 PR / T17 post-merge `/update-docs`** — out of scope for this session.

## Follow-ups (encode-lesson candidates, from review)

- **Error-code contract gate:** generate the `confirmHandoff` mapping table from the
  `livreur_confirm_handoff` migration's `RAISE EXCEPTION` strings so a new server code with
  no client mapping fails CI (today covered by a hand-maintained table test).
- **Edge-function log-scrub gate:** extend `functions:check` to fail when a
  `supabase/functions/**` `console.*` call passes a value not routed through a `scrub()`-style
  redactor.
- **Design pass (done):** the Linky brand — **emerald `#0E6E55` + saffron `#E8A53D`** — is now
  the token contract: `tailwind.config.js` `brand` ramp re-skinned from the placeholder indigo
  to emerald, a saffron `accent` role added, and `success`/`danger` aligned to the Linky palette,
  with `theme/colors.ts` mirrored in sync. Because these screens reference semantic `brand-*`
  roles only (never raw hex), the rebrand was a pure token change — no per-screen edits.
