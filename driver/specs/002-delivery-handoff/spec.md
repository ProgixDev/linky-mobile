# Spec 002 — Delivery detail & QR-scan handoff for the driver

- **Status:** active
- **Type:** feature
- **Requested by / owner:** Achraf Benamrane (founder)
- **Date:** 2026-06-22
- **Slice / areas touched:** `src/features/deliveries` (detail + scanner + confirm), replaces route `src/app/delivery/[id].tsx`, camera permission in `app.config.ts`. **Backend dependencies:** a single-delivery detail endpoint (full address + buyer contact) and a `livreur-confirm-handoff` endpoint wrapping the existing `livreur_confirm_handoff` RPC — see _Dependencies_. <!-- conflict detection -->

## Problem (the why)

A driver can see their deliveries (spec 001) but cannot finish one. The handoff is
the moment the whole platform turns on: the buyer shows their order QR, the driver
scans it, and that single act both proves delivery and releases the seller's
escrowed payment. Without it, orders never move from paid to released and drivers
never close a job. Because the scan releases money and **cannot be undone**, the flow
has to be both fast at the door and hard to get wrong.

## Desired behavior (the what)

Opening a delivery shows its full detail: order reference, the item (title + photo),
the **full street address** (revealed now, unlike the list’s area-only view), the
buyer’s name, and the current status. A primary action lets the driver scan the
buyer’s on-screen order QR with the camera. (The backend does not expose a verified
buyer phone, so tap-to-call is out of scope for v1 — see _Out of scope_.)

On a valid scan the driver sees a short **review** of the matched order and must tap
a final **Confirm delivery** — only then is the delivery marked delivered and the
escrow released, with a clear success state. A scan never releases anything on its
own. Every failure is honest: a QR that doesn’t match this delivery/driver (or an
already-completed order) is rejected with a clear message and releases nothing; if
the QR won’t scan the driver gets retry guidance, and if camera permission is denied
the screen explains how to enable it (Settings) rather than dead-ending; and because
releasing money needs the server, an offline device blocks confirm with a “reconnect
to confirm” state rather than risking a bad release. (A typed fallback is deferred —
the handoff secret is a non-displayed UUID, so it needs a future backend code.)

## Acceptance criteria

- **AC-1:** Opening a delivery shows order reference, item title + photo, full dropoff
  street address, buyer name, and current status.
- **AC-2:** The detail screen offers a clear “scan to confirm delivery” action that
  opens a camera QR scanner once camera permission is granted.
- **AC-3:** Scanning the buyer’s valid order QR shows a review of the matched order and
  requires a final explicit “Confirm delivery” tap — a scan alone releases nothing.
- **AC-4:** Confirming a valid handoff marks the delivery delivered and releases escrow,
  then shows a success state; the delivery no longer appears in the active list.
- **AC-5 (mismatch):** Scanning a QR that does not match this delivery, is for another
  driver, or is already delivered/released shows a clear error and releases nothing.
- **AC-6 (permission denied):** If camera permission is denied, the screen explains why
  and tells the driver how to enable it (e.g. opens Settings) and lets them retry —
  never a dead end.
- **AC-7 (offline):** If the device is offline, confirm is blocked with a clear
  “reconnect to confirm” state and a retry; nothing is released while offline.
- **AC-8 (idempotent):** Confirming a delivery that is already delivered/released does
  not release escrow a second time; the driver is told it’s already done.
- **AC-9 (authorization):** Only the assigned driver can confirm, authorized
  server-side from the JWT, and the scan token is verified server-side (a forged or
  guessed token is rejected). Full address + buyer name are shown only for the driver’s
  own assigned delivery.

## Out of scope

- The buyer-side QR display (lives in the Linky consumer app).
- Tap-to-call the buyer — the backend exposes no verified buyer phone via the order
  (phone lives in a separate verified table with no order link). Future work.
- Typed/manual handoff-code entry — deferred; needs a short human-readable backend
  handoff code (the current token is a non-displayed UUID). Scan is the only path in v1.
- Intermediate status steps (mark picked up / in transit) — separate spec.
- Disputes, refunds, cancellation, or reassignment flows.
- Offline queueing of confirmations (a money action stays online-only, AC-8).
- Partial / multi-item handoffs and per-item scanning.
- Tips, ratings, or proof-of-delivery photos after handoff.
- Turn-by-turn navigation (product anti-goal) — address text + tap-to-call only.

## CUJ impact

- Registers **new CUJ-003 — Driver completes a handoff**: open a delivery → scan the
  buyer’s QR → review → confirm → success (delivered + escrow released). Add to
  `docs/quality/critical-user-journeys.md` at ship. Note: live camera scanning is hard
  to drive deterministically in Maestro on a simulator, so the QR scan + release is
  verified via `/verify-ui` (Argent) and a dev-only scan hook; the Maestro flow covers
  navigation, the permission-denied path, and the offline-confirm block.

## Dependencies & resolved decisions

Grounded in the Linky backend (`20260622_02_deliveries.sql`) and consumer app.

- **Two backend endpoints to build (blocking, plan T0):** (a) `get-delivery` — returns
  one delivery’s full address + order + buyer `display_name` for the assigned driver
  (the list endpoint deliberately omits this); (b) `livreur-confirm-handoff` — wraps the
  service-role-only `livreur_confirm_handoff(order_id, livreur_id, scan_token)` RPC with
  the JWT-derived `livreur_id`.
- **QR payload (resolved):** `linky://order/<order_id>/confirm?token=<scan_token>`. The
  scanner parses `order_id` + `token` from this string; it must also match the opened
  delivery’s order (AC-5).
- **Buyer phone (resolved → NO):** the backend has no verified buyer phone linked to an
  order, so AC-1 shows buyer **name only**; tap-to-call is out of scope.
- **Escrow release (resolved → immediate):** the RPC flips order → `released` in the same
  transaction, no inspect window — success copy says “payment released”.
- **Idempotency / mismatch (resolved):** the RPC already rejects wrong-driver
  (`NOT_ASSIGNED_LIVREUR`), wrong token (`INVALID_SCAN_TOKEN`), and already-completed
  orders (order not in `paid`/`preparing` → `INVALID_STATUS`) — backing AC-5 and AC-9.
- **Camera (resolved → ADR at plan):** add `expo-camera` (new dependency + native config:
  `NSCameraUsageDescription` / Android `CAMERA`; needs a dev build). Reuse the
  `packs/scan-barcode` `CameraView`/`useCameraPermissions` pattern; do not install that
  product-scanner pack wholesale.
