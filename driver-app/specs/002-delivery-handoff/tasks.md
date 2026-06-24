# Tasks 002 — Delivery detail & QR-scan handoff

Ordered, executable, checkboxed. Work top-to-bottom, tick on commit. `[P]` = parallel-safe. Tests precede implementation. **Built on branch `feat/002-delivery-handoff` cut off `feat/001-assigned-deliveries`** (spec 001 is not yet on `main` in this repo — 002 builds on the 001 slice that lives there).

## Phase 0 — setup

- [x] **T0** Accept [ADR-0009](../../docs/architecture/decisions/0009-expo-camera-qr-scanning.md). `npx expo install expo-camera` → `~56.0.8`; added tailored `ios.infoPlist.NSCameraUsageDescription` + the `expo-camera` plugin in `app.config.ts` (QR-only: `recordAudioAndroid: false`, no mic string). · done: typecheck green; config valid.
- [x] **T1** Backend edge functions (Deno, Supabase Auth `getUser()` → service-role): `supabase/functions/get-delivery/index.ts` (one delivery's full address + order + buyer `display_name`, scoped to `livreur_id = caller`; `scan_token` never returned) and `supabase/functions/livreur-confirm-handoff/index.ts` (calls `livreur_confirm_handoff(order_id, getUser().id, scan_token)`; maps RPC codes → French envelope; UUIDs scrubbed from logs). `[functions.*] verify_jwt = true` in `config.toml`. · done: modeled on `list-livreur-deliveries`; `deno check` + **deploy DEFERRED** (no Supabase access). NOTE: the canonical Linky backend already ships `livreur-confirm-handoff` (self-rolled JWT, `verify_jwt=false`) — see fn headers for the deploy auth caveat. (AC-9 server side)

## Phase 1 — core behavior

- [x] **T2** Schema (`model/schema.ts`): `DeliveryDetailWireSchema`/`DeliveryDetailResponseSchema` (get-delivery wire) + flat `DeliveryDetailSchema` (full street address, buyer name, orderId, amount, status); `HandoffResultSchema` + `HandoffOutcome` typed union. · done: typecheck. (AC-1)
- [x] **T3** QR parse test-first: `__tests__/qr.test.ts` (10 cases) → `lib/qr.ts` `parseOrderQr(raw)` accepts `linky://order/<uuid>/confirm?token=<uuid>` → `{orderId, scanToken}`; rejects junk / non-uuid / other schemes / wrong path / trailing junk / non-string (SEC-INPUT-001). · done: tests green. (AC-5)
- [x] **T4** API test-first: extended `__tests__/deliveries-api.test.ts` → `lib/deliveries-api.ts` `getDelivery(id)` (sends `{delivery_id}` only; wire→flat; buyer fallback "Customer") + `confirmHandoff({orderId, scanToken, idempotencyKey})` (sends `{order_id, scan_token}` only — no identity, AC-9; via `functions.invoke`). Maps `INVALID_SCAN_TOKEN`/`NOT_ASSIGNED_LIVREUR`/`*_NOT_FOUND`→mismatch, `INVALID_STATUS`/`INVALID_DELIVERY_STATUS`→already_done, `FunctionsFetchError`→offline, else→error (generic copy, no leak) — returns a closed `HandoffOutcome` (never throws). Error-code→outcome contract table. · done: tests green. (AC-5/7/8/9)
- [x] **T5** Store: `removeDelivery(id)` in `model/store.ts` + tests (delivered item leaves `items` and `selectActiveDeliveries`; no-op for unknown id). · done: store test green. (AC-4)
- [x] **T6 [P]** Scanner UI: `ui/qr-scanner.tsx` — `expo-camera` `CameraView` (`barcodeTypes:['qr']`, `facing:'back'`), `useCameraPermissions` gate that is never a dead end (AC-6): not-asked → "Allow camera"; permanently denied → "Open Settings" (`Linking.openSettings`); always a Cancel. `lock` ref debounces `onScanned`; only surfaces the raw string. · done: renders (camera mocked in T8). (AC-2, AC-6)
- [x] **T7** Detail screen: `ui/delivery-detail-screen.tsx` — `useReducer` state machine view→scan→review→confirm→success/error; `getDelivery` on mount (loading/load-error+retry); scanned QR parsed + compared to this delivery's `orderId` (junk/forged/other-order → `mismatch`, nothing released); `confirmHandoff` only on the explicit Confirm tap (synchronous `submitting` ref debounce; online-only); success → `removeDelivery` + "Delivered — payment released"; offline keeps the token to retry; already-done + error states. Full street address revealed here. Feature-prefixed testIDs. · done: all states render (T8). (AC-1/3/4/7/8)
- [x] **T8** Component tests: `__tests__/delivery-detail-screen.test.tsx` (12 cases, expo-camera/-router mocked) — detail incl. full street address (AC-1); scan opens scanner (AC-2); valid scan → review, confirm NOT called until tap (AC-3); confirm → success + dropped from store (AC-4); QR-for-other-order + server-rejected token → mismatch, nothing released (AC-5); permission denied → enable/retry + Settings (AC-6); offline → reconnect + retry (AC-7); already-done + lost-response-retry → already-done never a second release (AC-8); + double-tap-releases-once + load-error/retry. · done: green.
- [x] **T9** Route: replaced placeholder `src/app/delivery/[id].tsx` → reads `id` via `useLocalSearchParams`, renders `<DeliveryDetailScreen id={id} />` (via the feature public API); exported `DeliveryDetailScreen` from `index.ts`. · done: typecheck green; navigable.

## Phase 2 — verification

- [x] **T10** Maestro `.maestro/flows/handoff-cuj.yaml` — sign-in → open delivery → assert detail + scan affordance (AC-1/2) → deny OS camera prompt → assert in-app explainer + cancel (AC-6, no dead end) → back. Live scan/confirm/offline noted as Argent-only (T11). Registered **CUJ-003** (docs:lint CUJ↔Maestro sync green). · done: written; `e2e:ios` **DEFERRED** (no macOS sim + seeded livreur).
- [ ] **T11** `/verify-ui` on a device — scan a real/dev QR, walk **CUJ-003**, screenshot detail/scan/review/success/mismatch/offline. **DEFERRED — needs a dev build (camera) + device + Supabase.** Must run before merge.
- [x] **T12** `npm run verify` green — format:check + lint + animations:check + typecheck + **test (88 pass / 13 suites)** + docs:lint (CUJ↔Maestro sync OK) + functions:check + secrets:check. Conventional commits throughout.

## Phase 3 — review & ship

- [x] **T13** `/review` (multi-persona) → REQUEST-CHANGES, all findings resolved: P1 (post-release retry → already_done, verified vs canonical RPC + locked with tests); P2s (no error-string leak; Idempotency-Key wired + documented); P3s (UUID log scrub, status-clamp single source, confirming Card chrome). **CUJ-003** registered (T10). · done: `npm run verify` green (88 tests).
- [x] **T14** `/security-review` (against `docs/security/checklist.md`) → **PASS, no P1s.** SEC-INPUT-001 (QR validated pre-network + Zod edges + orderId compared), SEC-LINK-002/SEC-RLS-001 spirit (identity JWT-derived, client sends no id, get-delivery scoped to caller), SEC-SECRET-001/003 (service-role server-side, scan_token never returned), SEC-LOG-001 (UUID scrub), SEC-STORE-001 (full address transient). Money action: server-RPC-only release, scan never releases, online-only, double-tap guarded + idempotent. Watch: deploy with canonical self-rolled-JWT auth. Verdict in the feature report.
- [x] **T15** `/feature-report` → [`docs/reports/002-delivery-handoff.md`](../../docs/reports/002-delivery-handoff.md) — diff summary, AC→evidence (AC-1..AC-9), review + security verdicts, deferred-work list, encode-lesson follow-ups.
- [ ] **T16** Open PR — **SKIPPED this session** (per instruction; no remote push).
- [ ] **T17** After merge: `/update-docs` — feature doc, flip spec → `shipped`. **DEFERRED** (post-merge).

## AC coverage (mirror of plan.md)

- [x] AC-1 → T2, T7, T8
- [x] AC-2 → T6, T8
- [x] AC-3 → T7, T8
- [x] AC-4 → T5, T7, T8
- [x] AC-5 → T3, T4, T8
- [x] AC-6 → T6, T8
- [x] AC-7 → T4, T8
- [x] AC-8 → T4, T8
- [x] AC-9 → T4, T1 (server — deploy/deno-check deferred)
