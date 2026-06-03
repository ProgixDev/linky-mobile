# Phase K — V1.1 polish backlog

Phase K (admin dispute console) shipped V1 between 2026-06-01 and 2026-06-03. Eight items were deferred during the build with a clear "V1.1" tag. None blocks the V1 launch; each is a defense-in-depth or operational-polish concern that becomes real once a second admin joins the system or once dispute volume grows.

This document is the client-shareable mirror of the internal memory `project_phase_k_v1_1_followups`. Effort is scoped on an `S` (one focused change) / `M` (single feature, multiple files) / `L` (cross-cutting, infra / schema) scale rather than hours, because each item depends on whether unrelated dependencies (realtime infra, push infra, second admin) land first.

---

## 1. Kanban "En examen" persistence

- **V1 today** — the "En examen" column on the admin Kanban is React local state (`Set<string>`). Dragging a card into it marks "I'm looking at this" for the current admin.
- **Limit** — refresh wipes the state. With one admin nothing breaks; with two admins both could pick the same dispute and not know.
- **V1.1 target** — persist claim / release as `admin_actions` rows; add `orders.claimed_by_id` + `orders.claimed_at`. New `/claim-dispute` edge fn.
- **Effort** — M.

## 2. 30s polling → Supabase realtime

- **V1 today** — `useDisputes` polls `list-disputes` every 30 seconds (`refetchInterval: 30_000`).
- **Limit** — admin bandwidth and cache churn for nothing 95% of the time; new disputes have up to 30s of latency.
- **V1.1 target** — Supabase realtime channel filtered on `orders WHERE status='disputed'`; on INSERT/UPDATE invalidate the disputes query. Keep a 5-minute safety poll.
- **Effort** — M.

## 3. `list-disputes` widen for resolved entries

- **V1 today** — endpoint filters server-side on `.eq('status','disputed')`. Kanban's "Remboursés" / "Libérés" columns fill only with disputes resolved in the current session.
- **Limit** — on first page load the resolved columns are empty even when resolutions exist. Multi-admin handoff becomes opaque.
- **V1.1 target** — add `include_resolved?: { since_days }` to the body, UI default 7 days. Alternative: dedicated `/list-resolved-disputes`.
- **Effort** — S.

## 4. Live banner mobile updates

- **V1 today** — `OrderResolutionBanner` (K.6) renders correctly the next time `useOrder` refetches — typically on navigation back or pull-to-refresh.
- **Limit** — a buyer watching the screen at the moment of admin resolution sees nothing until they interact.
- **V1.1 target** — either flip `refetchOnWindowFocus: true` on the order query (cheapest) or subscribe to a per-order realtime channel for the lifetime of the screen.
- **Effort** — S (focus flag) / M (realtime).

## 5. Self-deal assertion in `resolve_dispute`

- **V1 today** — the RPC does not verify that `admin_id` differs from `buyer_id` / `seller_id`. An admin who is also party to the order can rule on it.
- **Limit** — V1 has one admin and they self-report. No exploit observed; the door is structurally open and was flagged during hand-test K.3 on `LK-2026-10027`.
- **V1.1 target** — RPC raises `self_deal_forbidden` when the admin is buyer or seller; edge fn maps to `FORBIDDEN_SELF_DEAL` (400). Pairs with the threshold sign-off (see memory `project_phase_k_threshold_signoff`).
- **Effort** — S.

## 6. Push notifications on `dispute_resolved`

- **V1 today** — resolution is surfaced via the in-app banner only (K.6); buyer / seller learn only when they re-open the app.
- **Limit** — time-to-awareness is bounded only by app-open frequency. For sellers waiting on a release decision this can be hours.
- **V1.1 target** — dispatch APNS / FCM from the `resolve-dispute` edge fn after the RPC succeeds; body localized per outcome and viewer role.
- **Effort** — M (wiring) once infra lands; infra itself is L (see memory `project_post_phase_k_queue` item 2). Blocked on Apple Developer account from the client side.

## 7. Admin Kanban claimed-by indicator

- **V1 today** — no display of who is looking at what. Item 1 stores the data; item 7 surfaces it.
- **Limit** — without a visible badge the persistence is invisible value.
- **V1.1 target** — avatar chip top-right of the card showing the claimant's initials, tooltip with full name + claimed_at, click-to-unclaim for the claimer.
- **Effort** — S, gated on item 1.

## 8. Audit history pagination

- **V1 today** — `get-dispute` returns every `admin_actions` row for the order in one payload. Typical count is 1–3.
- **Limit** — fine while V1, gets uncomfortable once threshold sign-off, revocations and re-opens land (each leaves multiple rows).
- **V1.1 target** — add `cursor?: { created_at; id }` to the endpoint; drawer renders the first page with a "Charger plus" affordance.
- **Effort** — S.

---

## Cross-references

- `CLIENT_STATUS_REPORT_2026-06-01.html` — last full status report at repo root; client-facing context.
- Memory `project_qr_gate_v1_1_hardening` — sibling V1.1 hardening list (8 items, 2026-06-01 audit); same defer posture.
- Memory `project_phase_k_threshold_signoff` — high-value dispute sign-off; complements item 5.
- Memory `project_post_phase_k_queue` — push-notif and messaging infra ordering; gates item 6.
