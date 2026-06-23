# Tasks 002 — Delivery detail & QR-scan handoff

Ordered, executable, checkboxed. Work top-to-bottom, tick on commit. `[P]` = parallel-safe. Tests precede implementation. **Sequence after spec 001 merges** (shared slice + route — see plan Overlap check).

## Phase 0 — setup

- [x] **T0** Accept [ADR-0009](../../docs/architecture/decisions/0009-expo-camera-qr-scanning.md) (human — accepted 2026-06-23). Branch `feat/002-delivery-handoff` cut off **`feat/driver-app`** (NOT `main` — spec 001 + Linky-auth/backend realignment are unmerged and live only there). `npx expo install expo-camera` → `~56.0.8`; added tailored `ios.infoPlist.NSCameraUsageDescription` + the `expo-camera` plugin in `app.config.ts` (mic + Android `RECORD_AUDIO` disabled — QR only). · done: typecheck green; `expo config` resolves the plugin + usage string.
- [x] **T1** Backend edge function (Deno, service-role, `requireUser` JWT auth). **Only `get-delivery` built** — `livreur-confirm-handoff` ALREADY exists in the canonical backend (`app-mobile/supabase/functions`, see plan backend-reality note). Created `app-mobile/supabase/functions/get-delivery/index.ts` (returns one delivery's FULL address + order + buyer `display_name`, scoped to `livreur_id = caller`; unknown/not-yours → `DELIVERY_NOT_FOUND`; scan_token never returned) modeled on `list-livreur-deliveries`. Registered `[functions.get-delivery] verify_jwt = false` in `config.toml` — matches the canonical post-incident policy (verify_jwt OFF for every fn, auth via in-function `requireUser`), NOT the stale `= true`. · done: modeled + config registered; `deno check` + deploy **deferred** (no Supabase access / import map here). Outside `npm run verify`.

## Phase 1 — core behavior

- [x] **T2** Schema (`model/schema.ts`): `DeliveryDetailWireSchema`/`DeliveryDetailResponseSchema` (get-delivery wire) + flat `DeliveryDetailSchema` (full street address, buyer name, orderId, order ref/amount/snapshot, status); `HandoffResultSchema` (success `{ order_status }`) + `HandoffOutcome` typed union (success/mismatch/already_done/offline/error). · done: typecheck green. (AC-1)
- [x] **T3** QR parse test-first: `__tests__/qr.test.ts` (10 cases) → `lib/qr.ts` `parseOrderQr(raw)` accepts `linky://order/<uuid>/confirm?token=<uuid>` → `{orderId, scanToken}`; rejects junk / non-uuid / other schemes / wrong path / trailing junk / non-string (trust boundary, SEC-INPUT-001). · done: tests green. (AC-5)
- [x] **T4** API test-first: extended `__tests__/deliveries-api.test.ts` (now 15 cases) → `lib/deliveries-api.ts` `getDelivery(id)` (sends `{delivery_id}` only; wire→flat detail; buyer fallback "Customer"; Zod-parse) + `confirmHandoff({orderId, scanToken})` (sends `{order_id, scan_token}` only — no identity, AC-9; via canon `apiPost`, not `functions.invoke`). Maps `INVALID_SCAN_TOKEN`/`NOT_ASSIGNED_LIVREUR`/`ORDER|DELIVERY_NOT_FOUND`→mismatch, `INVALID_STATUS`/`INVALID_DELIVERY_STATUS`→already_done, `NETWORK_ERROR`→offline, else→error — returns a closed `HandoffOutcome` (never throws). · done: tests green. (AC-5/7/8/9)
- [x] **T5** Store: `removeDelivery(id)` in `model/store.ts` + test (delivered item leaves both `items` and `selectActiveDeliveries`). · done: store test green (7 cases). (AC-4)
- [ ] **T6 [P]** Scanner UI: `ui/qr-scanner.tsx` — `expo-camera` `CameraView` (`barcodeTypes:['qr']`), `useCameraPermissions` gate with explain + enable/retry (no dead end), debounced `onScanned`. · done: renders (camera mocked). (AC-2, AC-6)
- [ ] **T7** Detail screen: `ui/delivery-detail-screen.tsx` — state machine view→scan→review→confirm→success/error; `getDelivery` on mount; `confirmHandoff` on the explicit Confirm tap (debounced, online-only); success calls `removeDelivery` + shows “delivered, payment released”. Feature-prefixed testIDs. · done: all states render. (AC-1/3/4/7/8)
- [ ] **T8** Component tests: `__tests__/delivery-detail-screen.test.tsx` — detail (AC-1); scan opens camera (AC-2); valid scan → review, confirm NOT called until tap (AC-3); confirm → success + removed (AC-4); mismatch → error, nothing released (AC-5); permission denied → enable/retry (AC-6); offline → reconnect + retry (AC-7); already-done message (AC-8). · done: green.
- [ ] **T9** Route: replace placeholder `src/app/delivery/[id].tsx` → `DeliveryDetailScreen`; export from `index.ts`. · done: navigable.

## Phase 2 — verification

- [ ] **T10** Maestro `.maestro/flows/handoff-cuj.yaml` — covers navigation + permission-denied + offline-confirm block (NOT live scan). · done: written; `e2e:ios` **deferred** (no macOS).
- [ ] **T11** `/verify-ui` on a device — scan a real/dev QR, walk **CUJ-003**, screenshot detail/scan/review/success/mismatch/offline. **DEFERRED — needs a dev build (camera) + device + Supabase.** Must run before merge.
- [ ] **T12** `npm run verify` green; conventional commits.

## Phase 3 — review & ship

- [ ] **T13** `/review`; fix P0/P1. Register **CUJ-003** in `docs/quality/critical-user-journeys.md` here (like 001).
- [ ] **T14** `/security-review` — money action (single-release, server-enforced), camera permission, JWT-derived identity, QR trust boundary (SEC-INPUT-001).
- [ ] **T15** `/feature-report` → `docs/reports/002-delivery-handoff.md`.
- [ ] **T16** Open PR (needs the dedicated `linky-driver` repo; after 001 merges).
- [ ] **T17** After merge: `/update-docs` — feature doc, flip spec → `shipped`.

## AC coverage (mirror of plan.md)

- [ ] AC-1 → T2, T7, T8
- [ ] AC-2 → T6, T8
- [ ] AC-3 → T7, T8
- [ ] AC-4 → T5, T7, T8
- [ ] AC-5 → T3, T4, T8
- [ ] AC-6 → T6, T8
- [ ] AC-7 → T4, T8
- [ ] AC-8 → T4, T8
- [ ] AC-9 → T4, T1 (server)
