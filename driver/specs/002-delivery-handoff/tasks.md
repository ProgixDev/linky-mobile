# Tasks 002 — Delivery detail & QR-scan handoff

Ordered, executable, checkboxed. Work top-to-bottom, tick on commit. `[P]` = parallel-safe. Tests precede implementation. **Sequence after spec 001 merges** (shared slice + route — see plan Overlap check).

## Phase 0 — setup

- [ ] **T0** Accept [ADR-0009](../../docs/architecture/decisions/0009-expo-camera-qr-scanning.md) (human). Branch `feat/002-delivery-handoff` off `main`. `npx expo install expo-camera`; add tailored `ios.infoPlist.NSCameraUsageDescription` + the `expo-camera` plugin (Android `CAMERA`) in `app.config.ts`. · done: typecheck green; config valid.
- [ ] **T1** Backend edge functions (Deno, service-role, JWT→`getUser()`): `supabase/functions/get-delivery/index.ts` (return one delivery's full address + order + buyer `display_name` for the assigned livreur) and `supabase/functions/livreur-confirm-handoff/index.ts` (call `livreur_confirm_handoff(order_id, getUser().id, scan_token)`; map RPC errors → JSON codes). Add `[functions.*] verify_jwt = true` to `config.toml`. · done: modeled on `list-livreur-deliveries`; `deno check` + deploy **deferred** (no Supabase access here).

## Phase 1 — core behavior

- [ ] **T2** Schema (`model/schema.ts`): `DeliveryDetailSchema` (full address incl. street `details`, buyer name, order ref/amount/snapshot, status), `HandoffResultSchema` + typed error union. · done: typecheck. (AC-1)
- [ ] **T3** QR parse test-first: `__tests__/qr.test.ts` → `lib/qr.ts` `parseOrderQr(raw)` accepts `linky://order/<uuid>/confirm?token=<uuid>` → `{orderId, scanToken}`; rejects junk / non-uuid / other schemes. · done: tests green. (AC-5)
- [ ] **T4** API test-first: extend `__tests__/deliveries-api.test.ts` → `lib/deliveries-api.ts` `getDelivery(id)` + `confirmHandoff({orderId, scanToken})`; request carries only orderId+token (no identity, AC-9); map `INVALID_SCAN_TOKEN`/`NOT_ASSIGNED`→mismatch, `INVALID_STATUS`→already_done, transport error→offline; Zod-parse. · done: tests green. (AC-5/7/8/9)
- [ ] **T5** Store: `removeDelivery(id)` in `model/store.ts` + test (delivered item leaves the active list). · done: store test green. (AC-4)
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
