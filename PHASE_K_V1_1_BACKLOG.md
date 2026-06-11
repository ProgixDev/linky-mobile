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

# Phase Q (Stripe card rail) — V1.1 additions (2026-06-11 review)

## Q-1. Stale stripe-PI sweep

- **V1 today** — stripe intents are excluded from `expire_stale_intents` by design (a TTL'd order could still be charged through a stale payment sheet). Abandoned card orders sit at `placed` + intent `pending` until the buyer cancels.
- **Limit** — stale rows accumulate; the buyer's order list keeps a zombie entry.
- **V1.1 target** — server-side sweep that cancels the Stripe PI FIRST (API call — closes the charge window), then expires the intent + cancels the order locally. Order of operations is the safety property.
- **Effort** — M.

## Q-2. `charge.refunded` / `dispute.*` alerting before live mode

- **V1 today** — the webhook handles only `payment_intent.succeeded/payment_failed/canceled`. Refunds or card disputes issued from the Stripe dashboard would not touch the ledger and would go unnoticed.
- **Limit** — acceptable in test mode; in live mode an unnoticed refund means the ledger says escrowed while Stripe clawed the money back.
- **V1.1 target** — handle `charge.refunded` + `charge.dispute.*` with CRITICAL logging/alerting (no auto-ledger action — humans arbitrate), gate before the `sk_live_` swap.
- **Effort** — S (log + ack) / M (alert channel).

## Q-3. Cart-clear-before-payment dead-end

- **V1 today** — `usePlaceOrder` clears the cart on order creation (before payment). After a sheet cancel, « Recommencer » routes to `/checkout` with an empty cart.
- **Limit** — buyer has to re-find the product to retry a cancelled card payment.
- **V1.1 target** — either clear the cart only on paid/wallet success, or make « Recommencer » deep-link back to the product. Touches the Lengopay retry flow too — shared fix.
- **Effort** — S/M.

## Q-4. Server-returned `publishable_key` unused client-side

- **V1 today** — place-order returns `payment.publishable_key` but the mobile `StripeProvider` reads `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` from env at build time.
- **Limit** — rotating the publishable key requires an app release; the server-driven rotation path exists but is dead code.
- **V1.1 target** — initialize/override the Stripe SDK with the server-returned key (e.g. `initStripe` on first card checkout), env value as fallback only.
- **Effort** — S.

---

# Shipped post-T (Phase U, 2026-06-11)

The accumulated review backlogs were consolidated into Phase U and shipped today. The items below were promoted out of the V1.1 list — they are now part of V1.

## K item 4 — Live banner mobile updates → SHIPPED (U.6, 331d538)

`useOrder` now sets `refetchInterval: 20_000` while `order.status === 'disputed'` (false on every other status, so the typical case is unaffected). Both order-detail screens (buyer view `app/order/[id].tsx` + seller view `app/seller/orders/[id]/index.tsx`) read off the same hook and so both update live when admin resolves. No realtime infra — that path stays in V1.1 if/when the volume warrants it.

## Q-3 — Cart-clear-before-payment dead-end → SHIPPED (U.3, af4b756)

`useCart.getState().clear()` moved out of `usePlaceOrder.onSuccess`. Three clear sites, each at a proven-paid moment: wallet branch in `app/checkout/index.tsx`, SUCCESS arm in `app/checkout/confirm/[orderId].tsx`, defensive wallet-path arm in the same file. A buyer can now retry a cancelled card / mobile-money payment without having to re-find the product.

## Phase O review items folded in (review batches 2026-06-10 → 2026-06-11)

The Phase O review items U.1, U.2, U.4, U.5 were superseded by the broader U.0 fix bundle (review-of-T review) plus targeted U.2/U.4/U.5 fixes:

- **U.1 (Phase O #1)** Real visit detail card — superseded by **U.0-B4** (548cf98). Pre-fix `pro/visites/[id].tsx` rendered `mockProperties[0]` ; now renders from the real joined `useAgentVisits` row (property, buyer, note, requestedAt). Mock imports deleted from the screen.
- **U.2 (Phase O #2)** Self-visit guard → SHIPPED (U.2, af4b756). `request-visit` 403s `SELF_VISIT_FORBIDDEN` when `prop.owner_id === userId`. Deployed v13 + probed (Linky envelope).
- **U.4 (Phase O #4)** Deeplink hygiene → SHIPPED (U.4, 0ffd8fb). New `app/+not-found.tsx` branded 404 ; `useNotificationTapRouting` now drops the deeplink when not signed in (instead of pushing it over onboarding into a 401 + back-less blank view).
- **U.5 (Phase O #5)** Notifications "Charger plus" → SHIPPED (U.5, 0ffd8fb). New `useNotificationsInfinite` wraps `useInfiniteQuery` over `/list-notifications` with cursor support ; the screen flattens pages and renders a Button at list end when `hasNextPage`. Mark-read semantics untouched.

## Cross-references — review batches consolidated into U.0

The U.0a / U.0b / U.0c / U.0d commits closed the T.3 + T.4 external adversarial review : 7 blockers, 18 should-fixes, 11 nits, 8 verification-round items. Highest-impact fixes were `useProducts` strip-own-products bug (B1, 548cf98), the fake `offer.tsx` / `pro/visites/[id].tsx` / `pro/demandes/[id].tsx` / RevenueHero replacements (B2-B5, 548cf98), the wallet money-state gates on home / checkout / payouts (B6 + U.0d, 548cf98 + 293ef56), and the cached-list regression guards on the exclusive-error pattern (U.0d, 293ef56 + 55cd1eb).

---

## Cross-references

- `CLIENT_STATUS_REPORT_2026-06-01.html` — last full status report at repo root; client-facing context.
- Memory `project_qr_gate_v1_1_hardening` — sibling V1.1 hardening list (8 items, 2026-06-01 audit); same defer posture.
- Memory `project_phase_k_threshold_signoff` — high-value dispute sign-off; complements item 5.
- Memory `project_post_phase_k_queue` — push-notif and messaging infra ordering; gates item 6.
