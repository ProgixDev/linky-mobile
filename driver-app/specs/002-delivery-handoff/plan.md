# Plan 002 — Delivery detail & QR-scan handoff

- **Spec:** [spec.md](spec.md) (all open questions resolved: yes — phone dropped, manual entry descoped, QR/escrow/idempotency confirmed)
- **Author:** Claude (agent) · **Date:** 2026-06-23
- **Size:** **L** — new native capability (camera, [ADR-0009](../../docs/architecture/decisions/0009-expo-camera-qr-scanning.md)) + new dependency (`expo-camera`) + two new edge functions + an **irreversible money action** (escrow release). Builds on the 001 `deliveries` slice.

## Approach

Replace the placeholder `/delivery/[id]` route with a real handoff flow inside the
`deliveries` slice, driven by a small state machine: **view detail → scan → review →
confirm → success**. Detail comes from a new `get-delivery` edge function (full address

- buyer name, which the list deliberately omitted). The scanner (`expo-camera`, QR-only)
  parses the buyer's QR `linky://order/<id>/confirm?token=<token>`; a valid scan shows a
  review and requires an explicit **Confirm** tap before calling a new
  `livreur-confirm-handoff` edge function that wraps the service-role
  `livreur_confirm_handoff` RPC. The **server is the source of truth** for authz and
  idempotency — the client never sends a driver id, and the RPC's error codes
  (`NOT_ASSIGNED_LIVREUR`/`INVALID_SCAN_TOKEN`/`INVALID_STATUS`) drive AC-5/AC-8. Because
  release moves money, confirm is **online-only**: a transport error maps to a "reconnect"
  state (no connectivity library needed). On success the delivery is removed from the
  active list. Key trade-off: live camera scanning isn't deterministically testable in
  Maestro, so the scan path is verified via `/verify-ui` (Argent) + a dev-only scan hook.

## Already exists — reuse, do NOT recreate

| Need                        | Reuse (path)                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slice, store, list mutation | `src/features/deliveries/*` (001) — add to it; `useDeliveriesStore` to drop the delivered item                                                                               |
| Backend call + Zod edge     | `lib/deliveries-api.ts` pattern; `supabase.functions.invoke` (auto JWT)                                                                                                      |
| Edge-fn auth pattern        | `supabase/functions/list-livreur-deliveries/index.ts` (Bearer → `getUser()` → service-role query)                                                                            |
| Camera pattern              | `packs/scan-barcode/src/use-barcode-scanner.ts` + `ui/scan-screen.tsx` (`CameraView`, `useCameraPermissions`, `onBarcodeScanned`) — copy the pattern, don't install the pack |
| UI states                   | `shared/ui` (`Screen`, `Button`, `Card`, `AppText`, `EmptyState`); 001's loading/error/offline patterns                                                                      |
| Camera permission config    | `app.config.ts` commented `infoPlist.NSCameraUsageDescription` example (line ~67)                                                                                            |
| Detail route                | replace existing placeholder `src/app/delivery/[id].tsx`                                                                                                                     |

## Placement (per `docs/architecture/module-boundaries.md`)

| What          | Where                                                                                                            | Notes                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Route         | `src/app/delivery/[id].tsx`                                                                                      | replace placeholder → renders `DeliveryDetailScreen`                              |
| Detail screen | `src/features/deliveries/ui/delivery-detail-screen.tsx`                                                          | state machine (view/scan/review/confirm/success/error)                            |
| Scanner       | `src/features/deliveries/ui/qr-scanner.tsx`                                                                      | `expo-camera` `CameraView` (QR-only) + permission gate (AC-6)                     |
| QR parse      | `src/features/deliveries/lib/qr.ts`                                                                              | `parseOrderQr(raw)` → `{orderId, scanToken}` \| null (pure)                       |
| API           | `src/features/deliveries/lib/deliveries-api.ts`                                                                  | add `getDelivery(id)`, `confirmHandoff({orderId, scanToken})` (typed error union) |
| Schema        | `src/features/deliveries/model/schema.ts`                                                                        | add `DeliveryDetailSchema`, `HandoffResultSchema`                                 |
| List mutation | `src/features/deliveries/model/store.ts`                                                                         | `removeDelivery(id)` on confirm success (AC-4)                                    |
| Backend       | `supabase/functions/get-delivery/`, `supabase/functions/livreur-confirm-handoff/` (+ `config.toml` `verify_jwt`) | Deno; outside `npm run verify`                                                    |
| Native config | `app.config.ts`                                                                                                  | tailored `NSCameraUsageDescription`; `expo-camera` plugin (Android `CAMERA`)      |
| ADR           | `docs/architecture/decisions/0009-expo-camera-qr-scanning.md`                                                    | accept before implementing                                                        |

## Data & state

- **Async:** `getDelivery(id)` and `confirmHandoff({orderId, scanToken})` via
  `functions.invoke` (no client identity — JWT only), Zod-parsed.
- **Client state:** a transient `useReducer` state machine in the detail screen (not
  persisted). `confirmHandoff` returns a typed result; transport failure → `offline`.
- **Validation (SEC-INPUT-001):** the scanned QR is a trust boundary — `parseOrderQr`
  validates the `linky://order/<uuid>/confirm?token=<uuid>` shape and uuids; edge
  responses Zod-parsed; scanned `orderId` must equal the opened delivery's order (AC-5).

## Acceptance criteria → verification mapping

| AC                                              | Proven by                                                                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 detail content                             | `delivery-detail-screen.test.tsx` (renders ref/item/address/name/status) + `deliveries-api` getDelivery parse                                                          |
| AC-2 scan opens camera                          | `delivery-detail-screen.test.tsx` (permission granted → press scan → `qr-scanner` shown; expo-camera mocked)                                                           |
| AC-3 scan → review → confirm required           | `delivery-detail-screen.test.tsx` (valid scan → review; `confirmHandoff` NOT called until Confirm tap)                                                                 |
| AC-4 confirm → released + success + leaves list | `delivery-detail-screen.test.tsx` (success state) + `store.test.ts` (`removeDelivery` drops it)                                                                        |
| AC-5 mismatch                                   | `qr.test.ts` (junk/mismatched parse) + `deliveries-api.test.ts` (maps `INVALID_SCAN_TOKEN`/`NOT_ASSIGNED` → error) + screen test (error, nothing released)             |
| AC-6 permission denied                          | `delivery-detail-screen.test.tsx` (denied → explain + enable/retry, no dead end)                                                                                       |
| AC-7 offline                                    | `deliveries-api.test.ts` (transport error → `offline`) + screen test (reconnect state + retry; no release)                                                             |
| AC-8 idempotent                                 | `deliveries-api.test.ts` (`INVALID_STATUS` → `already_done`) + screen test (already-done msg, no second release)                                                       |
| AC-9 authorization                              | `deliveries-api.test.ts` (request carries only orderId+token, no identity) + **server** `getUser()` in both edge fns + RPC token/assignment gates (manual/deno verify) |

## Risks & unknowns

1. **Two edge functions don't exist** (`get-delivery`, `livreur-confirm-handoff`) — built here (T0/T1), outside `npm run verify`; **deploy + `deno check` deferred** (needs Supabase access). RN work proceeds against mocks.
2. **`expo-camera` is native** — needs a dev build + `expo prebuild`; **camera cannot be verified on this Windows host** → `/verify-ui` on a device before merge.
3. **Irreversible money action** — correctness leans on the server RPC (authz + idempotency); client is online-only and surfaces error codes. Single Confirm tap is debounced to avoid double-submit.
4. **Maestro can't scan a camera** — CUJ-003's scan/release verified via Argent + a dev-only scan hook; the Maestro flow covers nav, permission-denied, and offline-confirm only.
5. **Buyer name nullable** (`display_name`) → fall back to "Customer".

## Overlap check

**Overlaps spec 001 (active)** — same slice (`src/features/deliveries`) and the same route
(`src/app/delivery/[id].tsx`, which 001 created as a placeholder and 002 replaces).
**Resolution: sequence — implement 002 only after 001 merges.** 002 builds on 001's
merged store/list and swaps the placeholder for the real screen; building them
concurrently would conflict on the slice and route. Flagged to the user.
