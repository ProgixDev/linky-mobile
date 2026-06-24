# Spec 001 — Assigned-deliveries list for the driver

- **Status:** active
- **Type:** feature
- **Requested by / owner:** Achraf Benamrane (founder)
- **Date:** 2026-06-22
- **Slice / areas touched:** `src/features/deliveries` (new), route `src/app/` (the driver's primary/home screen). **Backend dependency:** a Linky endpoint that returns the signed-in driver's deliveries — see _Dependencies_. <!-- used for conflict detection across active specs -->

## Problem (the why)

A livreur opening Linky Driver has no way to see the work that is theirs to do.
The whole driver loop — pick up, deliver, scan the buyer's QR to release escrow —
starts from knowing _which deliveries are assigned to me right now_. Without a
trustworthy worklist the driver can't start, and the platform can't move orders
from paid to delivered. This list is the app's front door; every other driver
feature hangs off a row in it.

## Desired behavior (the what)

A signed-in driver lands on a list of the deliveries currently assigned to **them**
that are still in progress. Each entry gives the driver, at a glance, what they
need to triage the job:

- the order reference (so it can be matched at handoff),
- what is being delivered (the item's title and photo),
- where it is coming from (the shop / seller it belongs to),
- where it is going, as an **area** (city / district) — not the full street address,
- the delivery's current status, and a time reference (how recently it came in).

The newest deliveries appear first. The driver can pull to refresh, and the list
also refreshes when the app returns to the foreground. Tapping an entry opens that
delivery (the detail / QR-handoff screen is a separate spec). The screen always
shows an honest state: a loading state on first load, a friendly empty state when
nothing is assigned, an error state with retry when the request fails, and — when
offline — the last successfully loaded list marked as possibly stale (or an
offline/retry state if there is nothing cached). A driver only ever sees their own
deliveries; the full street address is revealed later, at the handoff step.

## Acceptance criteria

- **AC-1:** Given a signed-in driver with one or more active deliveries, when the
  screen loads, then each delivery appears as a row showing the order reference, the
  item title and photo, the shop/seller it is from, the dropoff area (city/district),
  the current status, and a time reference.
- **AC-2:** Only deliveries belonging to the signed-in driver with status `assigned`
  or `in_transit` are shown; `unassigned`, `delivered`, `failed`, and `cancelled`
  deliveries do not appear.
- **AC-3:** Active deliveries are ordered most-recent first.
- **AC-4:** Given the driver pulls to refresh (or the app returns to the foreground),
  when the data has changed server-side, then the list updates to match without a
  full app restart.
- **AC-5 (empty):** Given a signed-in driver with zero active deliveries, when the
  screen loads, then a clear empty state is shown (e.g. "No deliveries assigned right
  now") with no error and no crash.
- **AC-6 (error):** Given the request fails, when the screen loads, then an error
  state with a retry action is shown; retrying re-issues the request; no stale or
  partial list is presented as current.
- **AC-7 (offline):** Given the device is offline and a list was loaded earlier in
  the session, when the driver opens the screen, then the last-cached list is shown
  with a visible offline / "may be out of date" indicator; given offline with no
  prior load, an offline state with retry is shown instead.
- **AC-8 (loading):** Given a first load with no cached data, the screen shows a
  loading state (not a blank or janky screen) until data or an error arrives.
- **AC-9 (authorization):** The list is scoped to the signed-in driver **on the
  server**; the client cannot obtain another driver's deliveries by tampering with
  the request (no client-supplied driver identity is trusted). A driver never sees a
  delivery assigned to anyone else, in any state, including from cache.
- **AC-10 (dropoff privacy):** On the list, the dropoff is shown as area only
  (city/district); the full street-level address is not displayed here (it is
  revealed at the separate detail / handoff step).

## Out of scope

- Browsing or **accepting** unclaimed/available jobs (separate spec).
- The delivery **detail / QR-scan handoff** screen and escrow release (separate spec);
  this spec only routes a tapped row toward it.
- Advancing delivery status (mark in transit / delivered) from the list.
- A **completed-deliveries history** view and any earnings / payout display.
- A **seller pickup street address** — the backend does not capture one yet (Phase 2);
  the list shows the source shop, not pickup directions.
- Turn-by-turn navigation or in-app routing (product anti-goal) — area text only.
- Maps / live GPS tracking on this screen.
- Sign-in, role gating, and account screens (owned by the existing `auth` slice).

## CUJ impact

- Registers **new CUJ-002 — Driver views assigned deliveries**: open app (as a
  signed-in driver) → see active deliveries newest-first → pull to refresh → empty,
  offline, and error states behave. Add to `docs/quality/critical-user-journeys.md`
  - a Maestro flow at ship.

## Dependencies & resolved decisions

Grounded in the Linky Supabase schema (`deliveries` table committed in
`20260622_02_deliveries.sql`; `livreur` role in `20260622_01_livreur_role.sql`).

- **Listing endpoint must be added (blocking dependency).** `deliveries` has RLS
  enabled with **no client policies** — authenticated clients cannot query it
  directly. A server-side endpoint (e.g. `list-livreur-deliveries`) that returns the
  caller's active deliveries, joined with the order's item/shop/dropoff-area, is
  referenced in Linky's livreur plan but **not yet implemented**. `/plan-feature`
  must treat building/confirming this endpoint as task T0; it is also what makes AC-9
  real (scoping happens server-side from the caller's identity).
- **No per-row driver pay** (resolved): there is no livreur payout model in the data
  (`amount_minor`/`fees_minor` are the seller/platform amounts). Omit pay until a
  payout model exists.
- **Ordering = most-recent first** (resolved): matches the existing index
  `(livreur_id, status, created_at desc)`; `pickup_at` is reserved/empty in Phase 1,
  so urgency/pickup-time ordering is a later enhancement.
- **Dropoff = area only** (resolved): `delivery_address` JSONB carries
  `{label, city, district, details}`; show city/district on the list, defer `details`
  to the handoff screen (AC-10).
