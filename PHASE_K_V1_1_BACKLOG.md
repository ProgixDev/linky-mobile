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

# New V1.1 items (Phase X, 2026-06-12)

## X.6 — Branded monochrome notification icon (Android)

**V1 today** — `app.json` plugin config + `AndroidManifest` meta-data only set the notification TINT (`#0A5240`). The notification ICON itself is intentionally NOT set (Android falls back to the launcher silhouette, which looks acceptable but unbranded). A placeholder would look worse than the default.

**V1.1 target** — the client ships a proper monochrome 96×96 PNG ; we drop it at `android/app/src/main/res/drawable-{hdpi,xhdpi,xxhdpi,xxxhdpi}/notification_icon.png` and add the manifest meta-data `expo.modules.notifications.default_notification_icon` pointing at `@drawable/notification_icon` (mirror what we did for the color). Also add to `app.json` plugin tuple `{ "icon": "./assets/images/notification-icon.png", "color": "#0A5240" }` for prebuild compatibility.

**Effort** — S, gated on the brand asset.


Items deliberately deferred during the Phase X audit-then-fix sweep. Each carries the honest UI in V1 (no dead promise on the user) and an explicit sizing so the work isn't lost.

## X.4 — Stripe card-topup

**V1 today** — `/app/wallet/recharger.tsx` is collapsed to an honest "Bientôt" surface for Mobile Money (Lengopay contract-blocked) and points the user to "pay by card at checkout" as the working today path. Wallet seeding for demos goes through `confirm_topup` via SQL (documented in `SMOKE_MATRIX_2026-06-12.md`).

**Limit** — buyers can't fund a Linky balance from the app. Wallet-funded purchases require an admin/SQL seed.

**V1.1 target** — full Stripe card-topup wired end-to-end. Five honest-effort pieces :

| Piece | Effort | Notes |
|---|---|---|
| Migration: add `rail`, `rail_intent_id`, `rail_status`, `client_secret_hint`, `last_polled_at`, `last_error_code`, `last_error_message` to `topup_intents` | M | Mirrors the `payment_intents` table shape. |
| New edge fn `wallet-topup-stripe-intent` (makePost, requireUser): create Stripe PI → INSERT topup row with the PI id → return `{ topup_id, payment: { client_secret, publishable_key } }` | M | Mirrors place-order's Stripe branch. |
| Extend `stripe-webhook` to detect topup-rail PIs (lookup `payment_intents` first, fall back to `topup_intents`) and call `confirm_topup(topup_id)` on success ; mirror cancelled / failed branches | M | Two cache writes possible per webhook now (order or topup). |
| Mobile flow: when source='card' in recharger.tsx, open Stripe sheet → route to `wallet/recharger/confirm/[topupId]` polling screen → redirect to `/wallet` on success ; mirror checkout/confirm/[orderId] pattern | M | Mirrors checkout/confirm/[orderId]. |
| Stale-Stripe-topup-PI sweep (reuse the V.6 cancel-first-then-flip pattern) | S–M | New sibling RPC `pick_stale_stripe_topup_intents` ; same cron-poll-intents fn extends to handle topup intents too. |

**Effort** — total L (one-week-ish if no surprises). The Lengopay rail comes online with a single config swap when the contract signs ; Stripe topup is more code-shaped work because the rail-intent linkage doesn't exist in `topup_intents` yet.

**Honest-UI check** — V1 recharger reads as honest "Bientôt" + "pay by card at checkout" CTA ; no dead buttons, no false success toasts.

---

# Shipped post-W (Phase X, 2026-06-12) — functionality sweep

Phase X was the end-to-end audit-then-fix pass : "every feature the
client asked for works end to end — frontend wired to backend, no dead
buttons, no mock data reachable, no UI that promises something the
server can't do." Audit-first methodology ; report VERIFIED-OK /
FIXED / DEFERRED per item ; fix only what's actually broken.

## X.1 — Visit-respond flow → FIXED (5a0eb39)

The pre-X buyer side was a stubbed empty state ; an agent's accept /
reject decision had no buyer-facing surface, and the notification
deeplink (`/property/<id>`) dropped the user on the listing instead
of the request. New `list-my-visit-requests` edge fn pivots on
`buyer_id` with a property snapshot join ; new `useMyVisitRequests`
hook + buyer/requests.tsx rewrite groups by status (pending /
accepted / rejected / cancelled / completed) following the U.0d
state pattern. `visit-respond` deeplink flipped to `/buyer/requests`.
Read-only V1 (no buyer-cancel — scope discipline).

## X.2 — Messaging contact on all three surfaces → FIXED (2ea16a9)

`/shop/<id>` had a dead "Message" button + dead kebab. Wired through
`useFindOrCreateConversation({ recipient_id: shop.ownerId })`.
Messaging contact now reachable from product, shop, AND shop-owner
profile — the three surfaces a buyer might use. `/messages/<id>`
fake "En ligne · répond en ~2h" subtitle removed (no presence
backend exists — it was a lie). Dead paperclip + kebab + hardcoded
"Aujourd'hui" separator dropped.

## X.3 — Mapbox directions → VERIFIED-OK

Property detail "Itinéraire" already routes through native `Linking`
to `geo:` / Apple Maps URLs with district-name fallback when the
lat/lng pair is missing. No change.

## X.4 — Wallet topup demoability → FIXED (adb281e)

`/wallet/recharger` collapsed to an honest "Bientôt disponible"
surface (no picker, no amount, no false success toast). Two CTAs
("Voir le marché", "Retour au portefeuille") + the working-today
pointer : "En attendant, tu peux payer par carte directement au
moment de l'achat". Wallet seeding for demos goes through SQL
(`confirm_topup` RPC ; documented in SMOKE_MATRIX). Stripe
card-topup full sizing in the V1.1 table above.

## X.5 — Admin manual-payout UI → VERIFIED-OK

Apparent mojibake (`payÃ©e`) in `withdrawals/page.tsx` traced to
PowerShell 5.1 console rendering UTF-8 as Windows-1252. Byte
inspection (`c3 a9` = valid UTF-8 `é`) confirmed the file is clean.
Tree-wide grep across `admin/src` + `app-mobile` returned no real
mojibake clusters. No change.

## X.6 — Android push setup + order-shipped flow → FIXED (X.6a bc024d1 + 1d8b6e9 + da1792d, X.6b 9b5705c)

**X.6a — Push wiring (bare-build aware)**. Three layers to handle
both the current `gradlew assembleRelease` flow AND a future
`expo prebuild` reset :
- `android/build.gradle` adds the `com.google.gms:google-services`
  classpath ; `android/app/build.gradle` applies the plugin
  conditionally (`if (new File(projectDir, 'google-services.json').exists())`)
  so the build stays green pre-Firebase-setup.
- `android/app/src/main/res/values/colors.xml` declares
  `notification_icon_color = #0A5240` ; AndroidManifest meta-data
  `expo.modules.notifications.default_notification_color` points
  at it.
- `app.json` plugin entry converted to tuple form
  `["expo-notifications", { "color": "#0A5240" }]` so a future
  prebuild yields the same posture without manual re-edits.
- `PUSH_SETUP.md` documents the user-side console steps (Firebase
  project + Android app for `com.linky.app` + download
  `google-services.json` + FCM V1 service-account key + upload to
  Expo for projectId `5154ed32-fa42-448f-ae1e-c99722101c76`) and
  the "remote push only works on builds made AFTER
  google-services.json lands" caveat.
- Native files force-added (`git add -f`) so a fresh clone still
  carries the hand-maintained gradle / manifest / colors config
  even though `android/` is gitignored.

**X.6b — Order-shipped flow end-to-end**. New `set-order-tracking`
edge fn : owner-guarded, atomic `.eq('status','paid')` transition
to `'preparing'` (race-safe like visit-respond), appends to
`orders.events` JSON `{at, kind:'shipped', label, tracking?,
carrier?}` (no migration — JSON array). `tracking_number`
OPTIONAL (≤ 60 chars — many Guinea deliveries are hand-carried) ;
`carrier` OPTIONAL. notifyDetached fires a buyer push "Commande
expédiée" with tracking in the body when set + deeplink to the
order detail. Mobile `useSetOrderTracking` hook + `ship.tsx`
wired with loading state, ActivityIndicator, success/error toast,
route-back on success.

## X.7 — Final dead-end + mock sweep → FIXED (a3984f2 + 2ce33ae)

12 dead-onPress handlers triaged. "Wire or remove, no third
option" rule :

- **Wired** : product/shop Share buttons → native Share API
  (message-only, no `url` field until a universal-link domain
  exists — the deeplink would surface as a dead link on devices
  without the app, especially since Android ignores the `url`
  field on share intents). shop "Message" → useFindOrCreateConversation.
  about/help/privacy buttons → mailto:support@linky.gn /
  security@linky.gn with structured subjects. about "Partager
  Linky" → Share. help status row → `https://linky.gn/status`.
- **Honest "Bientôt"** : settings/addresses + settings/phones
  (no backend in V1 — login number stays active for phones).
- **Removed** : about "Noter sur l'App Store" row (no V1 store
  presence). help "Chat avec l'équipe" with fake "En ligne" badge
  (no live-chat backend — the badge actively lied). seller/orders
  "Voir le reçu" alternative branch (order detail IS the receipt).
  Orphan `useRechargeWallet` hook (no consumer left after X.4).

Verified wired (no change) : data-saver toggle is consumed by
`DiscoverCard.tsx:84` (gates video autoplay AND flips the badge
to "en pause") ; theme picker wired through `useTheme()
.setPreference` ; dark-mode spot-check of buyer/requests,
recharger, payouts, messagerie, ship clean (the two `#FFFFFF`
hits are intentional white-on-green chip / radio fills, not
breakage).

## X.8 — Verify, deploy probes, launch docs → CLOSED (this commit)

Mobile + admin typechecks exit=0. Garbage-bearer probes against
the three X-touched edge fns (`list-my-visit-requests`,
`visit-respond`, `set-order-tracking`) all return the Linky
envelope (`IDEMPOTENCY_KEY_REQUIRED`) — fns are deployed AND
`verify_jwt=false` posture intact (no platform-level 401). No
redeploys needed. PHASE_K_V1_1_BACKLOG.md, RAPPORT_CLIENT_FINAL.html,
SMOKE_MATRIX_2026-06-12.md updated.

## X.9 — Hotfix : widen RPC status gates for 'preparing' → SHIPPED (540912b)

External verification of X.6b caught an escrow-bricking miss : the
"NO MIGRATION required" claim in `set-order-tracking` was wrong.
`confirm_order_receipt` (20260531_05:36) and `dispute_order`
(20260531_06:38) both gate on `status not in ('paid','delivered')`.
The X.6b transition `paid → preparing` therefore stopped any
shipped order from being confirmed OR disputed — funds locked the
moment the seller pressed "Confirmer l'expédition".

Fixed in one bundle :

- Migration `20260612_01_preparing_status_widening.sql` re-creates
  both RPCs verbatim with `'preparing'` added to the accept list.
  Applied via `scripts/x9-apply-preparing-widening.ps1` (Management
  API ; pattern from t1-apply-migration.ps1). Verified via
  `pg_get_functiondef(...) ilike '%preparing%'` returning true for
  both fns.
- `app/order/[id].tsx:38` — `inHandoffWindow` now includes
  `'preparing'`. Buyer scan CTA + dispute button + seller QR card
  stay visible while the package is in transit.
- `app/order/[id].tsx` timeline — STAGES match events by identity
  (`kind: 'shipped'` or `eventLabel`) instead of array index +
  visible-label string compare. Pre-fix the stage label
  `'En cours de remise'` never matched the X.6b event label
  `'Commande expédiée'`, so the shipped timestamp + tracking
  number never rendered. Tracking now also renders on a second
  line under the stage.
- `app/seller/orders/[id]/index.tsx:63` — `needsShip` narrowed to
  `status === 'paid'` only (pre-fix included `'placed'` which =
  unpaid, the fn rejects it).
- `useRequestVisit` — `qc.invalidateQueries(['my-visit-requests'])`
  + `['property', visit.propertyId]` onSuccess.
  `useMyVisitRequests` — `refetchOnMount: 'always'`. Pre-fix a
  buyer-side request submission silently contradicted the success
  toast (the destination /buyer/requests list was cached pre-
  request and the new row didn't appear).
- `list-my-visit-requests` + `BuyerVisitRequest` +
  `buyer/requests.tsx:251` — rename `priceMinor → priceGnf`. Values
  identical (GNF is integer-only) ; matches the project-wide
  `Product.priceGnf` convention ; pre-empts a future /100 bug if a
  fractional currency ever lands. Redeployed v2 ACTIVE
  verify_jwt=False, garbage-bearer probe returns the Linky
  envelope.
- `ship.tsx` tracking TextInput `maxLength={60}` mirrors the
  server-side validator.
- `settings/help.tsx` orphan `MessageCircle` + `haptic` imports
  removed (orphaned after the X.7 fake-chat-row removal).
- `set-order-tracking/index.ts` — doc-comment safety note on the
  events array read-modify-write : safe ONLY because the
  `.eq('status','paid')` condition makes the path single-shot per
  order ; SQL-side `jsonb || $1` in an RPC is the V1.1 hardening.

---

# Shipped post-U (Phase V, 2026-06-12) — server hardening

V.1 closed the big idempotency race ; V.2-V.8 cleared the rest of the
pre-launch server backlog. Per-item status :

## K-3 — list-disputes widen for resolved entries → SHIPPED (V.8, 4525600)

New optional body field `include_resolved: { since_days: number }`
(validated 1..90). When present, the status filter widens to PostgREST
.or() `status=disputed OR (status IN (refunded,released) AND updated_at
>= cutoff)`. Admin Kanban defaults to 7 days ; the Remboursés and
Libérés columns now fill on first page load.

## K-5 — self-deal assertion in resolve_dispute → SHIPPED (V.4, 5e55bfc)

Migration 20260611_06 inserts a fast-fail check after admin + outcome
validation : if `p_admin_id` equals `orders.buyer_id` or `seller_id`,
raise `self_deal_forbidden` P0001 BEFORE the row lock. Edge fn maps to
FORBIDDEN_SELF_DEAL 400 with vous-form admin copy. Pairs with the
threshold sign-off memory.

## Q-1 — Stale Stripe PI sweep → SHIPPED (V.6, a4f5291)

Migration 20260611_07 adds `pick_stale_stripe_intents(p_limit)` — FOR
UPDATE SKIP LOCKED picker for pending stripe intents older than 15
minutes whose rail_intent_id isn't the `pending-init-` placeholder.
cron-poll-intents v12 sweeps in a cancel-first / local-flip-second
order : `paymentIntents.cancel()` first, then on confirmed
`canceled` status, `process_intent_outcome('cancelled')` flips the
local intent + order atomically. Order of operations IS the safety
property.

## Q-2 — charge.refunded / charge.dispute.* alerting → SHIPPED (V.5, bf45862)

stripe-webhook v7 handles `charge.refunded`,
`charge.dispute.{created, funds_withdrawn, funds_reinstated, updated,
closed}` with **ack 200 + CRITICAL structured log + linky_intent_id /
linky_order_id context from the local payment_intents lookup**. NO
auto-ledger action — humans arbitrate (the Linky escrow exists
precisely for this). Hard precondition for the future sk_live swap.

## Q-3 — already shipped in Phase U.3 (af4b756). Listed here for cross-ref.

## V.1 idempotency reserve-first → SHIPPED (V.1, a5ba05f)

Migration 20260611_05 adds `status text` to idempotency_keys ; new
`reserveIdempotency` does INSERT-first-then-handler with optimistic
concurrency reaping on stale rows. Deploy order : list-notifications
first (probed conflict + replay via DB-inserted canned row), then
place-order, confirm-receipt, wallet-withdraw-request,
cancel-pending-payment, resolve-dispute. Old wrap stays on the auth /
list / get fns and non-money mutations (commit lists them
explicitly).

## V.2 ISO_RE anchor sweep → SHIPPED (V.2, c7a1fa3)

Eight cursor-based list endpoints + request-visit body validator now
use the trailing-anchored regex `/^\d{4}-\d{2}-\d{2}T...Z$/`. Benign
trailing garbage rejected 400 INVALID_BODY ; valid Z + .123Z still
pass.

## V.3 QR-gate quick wins → SHIPPED (V.3, 0c38834)

Items 1, 2, 3, 5 of the 2026-06-01 QR-gate audit :
 - get-order v13 strips `scanToken` from the idempotency cache via
   the existing cacheResponseFilter slot. Live response unchanged.
 - confirm-receipt v15 sanitizes Postgrest error logging
   (structured fields + UUID-redaction) so a future SQL RAISE
   accidentally embedding scan_token wouldn't leak to logs.
 - app/order/[id]/confirm.tsx narrows the token query param to
   `typeof === 'string' && /^[0-9a-f-]{36}$/i` — closes
   duplicate-query-param array slip-through.
 - app/orders/[id]/confirm-receipt.tsx DELETED (zero in-app
   callers ; deep-linkable mock screen).

QR-gate items 4 / 6 / 7 / 8 (token rotation, SELECT narrowing on
get-order, rate-limit on confirm-receipt, entropy review) stay V1.1.

## V.7 confirm_topup RPC fix → SHIPPED (V.7, 06f362d)

Migration 20260611_08 qualifies every column reference in the
function body (`le.wallet_id`, `t.id`, `w.user_id`). Pre-fix the bare
`wallet_id` resolved to the function's OUT parameter (shadowing
bug) — v_balance silently fell back to 0 and the credit posted
balance_after = 0 + amount even on a non-empty wallet. Lengopay rail
is still contract-blocked, but our side is now correct so the contract
becomes the only blocker.

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
