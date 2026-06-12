# Linky V1 — Smoke Matrix 2026-06-12

Six scenarios, each numbered. **User drives the phone**, observes the device, fills in **Actual** + **Pass/Fail** per row. After each fail we stop, fix-on-the-spot (smallest correct fix + commit), re-run only the failed step.

Phone runs the currently installed dev build / APK. SQL checks go through the Supabase dashboard's SQL editor (script provides the exact query each time).

Legend: ✅ Pass · ❌ Fail · ⏭ Skipped (note why).

---

## Scenario 1 — Pure buyer (no pro surface anywhere)

Fresh email or phone account. End state: roles=['buyer'], every pro surface gated.

| # | Step | Expected | Actual | P/F |
|---|---|---|---|---|
| 1.1 | Sign up (email or phone OTP) with a never-used contact. | Onboarding starts at /(onboarding)/welcome. |   |   |
| 1.2 | Profile setup → enter name, city, tick only "Acheteur". | Done screen appears. |   |   |
| 1.3 | SQL check: `select display_name, city, roles from public.users where id='<user_id>';` | display_name, city set; roles=`{buyer}`. |   |   |
| 1.4 | Home → "Vendre" quick action. | Routes to /profil/devenir?role=seller (pitch screen), NOT /create. |   |   |
| 1.5 | Tab bar → tap the empty `boutique` slot (deep link via long-press URL hack, or just verify the tab is `href:null`). | Tab shouldn't be visible. If user navigates to /(tabs)/boutique by deep link → RoleGateView "Réservé aux vendeurs ou agents immobiliers". |   |   |
| 1.6 | Deep link probe (Expo dev menu): `linky:///pro/visites`. | RoleGateView (in-page gate). |   |   |
| 1.7 | Deep link probe: `linky:///seller/orders`. | RoleGateView "Réservé aux vendeurs". |   |   |
| 1.8 | Deep link probe: `linky:///agent/leases`. | RoleGateView "Réservé aux agents immobiliers". |   |   |
| 1.9 | Deep link probe: `linky:///create/product/seller`. | RoleGateView "Réservé aux vendeurs". |   |   |
| 1.10 | Profil tab → quick actions. | Shows Commandes, Demandes, Favoris, Wallet, KYC. NO Ventes / Retraits / Boutique / Visites / Mes biens. |   |   |
| 1.11 | Profil → tap "Modifier mon profil". | Opens /profil/edit with name + city pre-filled; KeyboardAvoidingView pushes the footer above the keyboard. |   |   |
| 1.12 | Profil → "Mes rôles". | All 3 toggles visible; "Acheteur" ON, others OFF; toggling "Acheteur" OFF is refused (≥1 required). |   |   |

---

## Scenario 2 — Upgrade path (Devenir vendeur → KYC → publish)

Continue with the Scenario 1 account.

| # | Step | Expected | Actual | P/F |
|---|---|---|---|---|
| 2.1 | Home → "Vendre" → Devenir vendeur pitch. | 3 benefits (séquestre, badge, retraits Mobile Money), CTA "Devenir vendeur". |   |   |
| 2.2 | Tap "Devenir vendeur". | Routes to /kyc/intro (because kyc_status≠approved). |   |   |
| 2.3 | SQL check: `select roles, kyc_status from public.users where id='<user_id>';` | roles now contains `seller`; kyc_status='pending' or 'in_review' (depending on Didit state). |   |   |
| 2.4 | Run the real Didit verification (camera, ID front/back, selfie). | Didit dashboard shows session approved. App refreshes to kyc_status='approved'. |   |   |
| 2.5 | Home → "Vendre" again. | Routes to /create chooser (no more pitch, no more KYC detour). |   |   |
| 2.6 | Publish a product (any category) end-to-end. | Product appears on /(tabs)/marche under "Toutes". |   |   |
| 2.7 | SQL: `select count(*) from public.shops where owner_id='<user_id>';` | Exactly 1 shop ("Ma boutique"). |   |   |
| 2.8 | Publish a second product. | Same shop is reused (no duplicate). |   |   |
| 2.9 | Pro/stats now shows the seller's own products with REAL view_count. | ranked list, total views, no fake bars. |   |   |
| 2.10 | ShopDashboard "Mes annonces" lists both products with status pills (active). | Counters reflect real counts; pause/sold/delete buttons work via ManagementRow. |   |   |

---

### Demo wallet seeding (when a wallet-funded purchase is needed)

V1 has no working topup rail (Lengopay contract-blocked, no Stripe card-topup path yet — tracked V1.1). To demo a **wallet-funded** purchase, seed the buyer's wallet via the Management API SQL editor. The `confirm_topup` RPC is the canonical entry point — it inserts a `topup_intents` row at status='completed' and atomically posts a one-sided ledger credit so the wallet running balance is correct.

```sql
-- 1) Insert a pending topup row for the buyer (any positive amount_minor).
insert into public.topup_intents (user_id, currency, amount_minor, status, method)
values (
  '<buyer_user_id>'::uuid,   -- the buyer's public.users.id
  'GNF',
  5000000,                   -- 5 000 000 GNF (covers most demo purchases)
  'pending',
  'demo-seed'
)
returning id;                 -- copy this id

-- 2) Confirm it. confirm_topup atomically credits the wallet (auto-create
-- if absent) and flips the topup row to status='completed'. Returns the
-- wallet id + new running balance.
select * from public.confirm_topup('<topup_id_from_step_1>'::uuid);

-- 3) (Optional) Verify the credit landed.
select balance_after, ref_type, ref_id, created_at
  from public.ledger_entries
  where wallet_id = (
    select id from public.wallets
     where user_id = '<buyer_user_id>'::uuid and currency = 'GNF'
  )
  order by created_at desc limit 3;
```

This is the only acceptable demo seed path. The Recharger screen in V1 is honestly informational (Phase X.4 collapse) — it does NOT credit the wallet ; the in-app "Recharger" buttons land on the same screen and point users to "pay by card at checkout" as the working today path.

---

## Scenario 3 — Money path (card 4242 → escrow → QR confirm → withdrawal)

Need a SECOND account (buyer) to purchase from the seller of Scenario 2. Use a fresh email; no role upgrade needed.

| # | Step | Expected | Actual | P/F |
|---|---|---|---|---|
| 3.1 | Buyer adds the seller's product to cart, hits Checkout. | /checkout shows payment picker; "Wallet Linky" shows "Solde —" if wallet just created (walletReady false→true). |   |   |
| 3.2 | Pick "Carte" → pay with 4242 4242 4242 4242 / any future expiry / any CVC / any postal. | Stripe sheet succeeds. Routes to /checkout/confirm/<orderId> spinner, then auto-redirects to /checkout/success when webhook flips status='paid'. |   |   |
| 3.3 | SQL: `select status, total_minor from public.orders where id='<orderId>';` | status='paid'; total_minor = amount + fees. |   |   |
| 3.4 | Cart screen: `useCart` should be EMPTY (cart cleared on actual payment success per U.3). | Cart icon badge gone; cart screen shows empty state. |   |   |
| 3.5 | Sign in as seller. /seller/orders shows the new order with status "À PRÉPARER". | Row label says "tu reçois" + full amount (NOT amount-fees). |   |   |
| 3.6 | Seller marks ship; flow proceeds normally to "delivered". | Order status updates appear without re-launch (pull-to-refresh works too). |   |   |
| 3.7 | Buyer opens scan → scans the QR printed for that order (or pastes the URL with `?token=<scan_token>`). | /order/<id>/confirm route loads with valid token; hold-to-confirm enabled. |   |   |
| 3.8 | 5-second hold → confirmation animation → SQL: `select status from public.orders where id='<orderId>';` | status='released'. |   |   |
| 3.9 | SQL ledger check: `select wallet_id, direction, amount_minor, ref_type from public.ledger_entries where ref_id='<orderId>' order by created_at;` | One credit to SELLER wallet for `amount_minor` (ref_type='order_release'); one credit to PLATFORM wallet for `fees_minor` (ref_type='order_platform_fee'). NOTHING off the seller. |   |   |
| 3.10 | Seller /seller/payouts shows new SOLDE DISPONIBLE = `amount_minor` of the released order. | Skeleton on load, real number, no fake "0 GNF". |   |   |
| 3.11 | Seller "Retirer" → enter amount + Orange Money phone → submit. | Withdrawal row appears in HISTORIQUE with status "En attente". |   |   |
| 3.12 | Probe: bad scan_token (UUID-shaped but wrong). | Server raises INVALID_SCAN_TOKEN 400 with French message. |   |   |

---

## Scenario 4 — Dispute path (buyer → admin → mobile banner)

Need another paid (not-yet-released) order to dispute.

| # | Step | Expected | Actual | P/F |
|---|---|---|---|---|
| 4.1 | From buyer's /order/<id>, tap "Signaler un problème" → file dispute. | SQL: `select status from public.orders where id='<orderId>';` → 'disputed'. |   |   |
| 4.2 | Open the admin console (separate tab/laptop) → Litiges Kanban. | Disputed order appears in the "Ouverts" column. "Remboursés" + "Libérés" columns also show entries from the past 7 days (V.8). |   |   |
| 4.3 | Click the order → Resolution drawer. | Drawer shows participants, snapshot, event log. |   |   |
| 4.4 | Resolve with "Remboursement". | Toast "Litige résolu". SQL: `select status from public.orders where id='<orderId>';` → 'refunded'. |   |   |
| 4.5 | Buyer phone (still on /order/<id> screen, no navigation). | OrderResolutionBanner switches to the refund verdict within ~20 s (U.6 refetchInterval). |   |   |
| 4.6 | SQL ledger: `select direction, amount_minor, ref_type from public.ledger_entries where ref_id='<orderId>' order by created_at;` | Two credits BACK to buyer wallet: `order_refund` (amount) + `order_fee_refund` (fees). Platform retains nothing. |   |   |
| 4.7 | **Self-deal check**: while signed in as the admin (who is ALSO the buyer or seller of some order), attempt to resolve THAT order from the admin console. | Toast / inline error 400 FORBIDDEN_SELF_DEAL "Vous ne pouvez pas trancher un litige sur une commande dont vous êtes acheteur ou vendeur." |   |   |

---

## Scenario 5 — Error states + refresh recovery

Phone needs airplane mode toggleable.

| # | Step | Expected | Actual | P/F |
|---|---|---|---|---|
| 5.1 | Airplane mode ON. | All network requests fail. |   |   |
| 5.2 | Open wallet. | ErrorStateView with "Réessayer" (NOT an infinite skeleton). |   |   |
| 5.3 | Open marche → Articles. | ErrorStateView per tab; cached list (if any) NOT erased by the failure. |   |   |
| 5.4 | Open decouvrir. | ErrorStateView ("Impossible de charger le feed"). |   |   |
| 5.5 | Open messagerie. | If no cached convs → ErrorStateView. If cached → cached list stays (U.0d guard). |   |   |
| 5.6 | Open notifications. | Same pattern. |   |   |
| 5.7 | Airplane mode OFF. | Network recovers. |   |   |
| 5.8 | Pull-to-refresh on wallet / marche / decouvrir / messagerie / notifications / seller/orders / pro/visites. | Each screen refetches and rehydrates without re-mount. |   |   |
| 5.9 | Marche → set a filter (city or price max) → no results → "Aucun résultat / Effacer les filtres" CTA visible. | Tapping the CTA calls filters.reset() preserving marcheTab and clears the search query. |   |   |
| 5.10 | Marche empty inventory (rare) → "Aucune annonce pour le moment. Reviens bientôt." (NOT the "Effacer les filtres" branch when filters are default). |   |   |   |

---

## Scenario 6 — Deeplink hygiene

| # | Step | Expected | Actual | P/F |
|---|---|---|---|---|
| 6.1 | Trigger an unknown deep link: `linky:///does/not/exist`. | Branded `+not-found` screen with Compass icon, calm French copy, single CTA → /(tabs). |   |   |
| 6.2 | Sign out. Trigger a notification-tap simulation (`linky:///seller/orders`). | Deeplink is DROPPED (user lands on /(onboarding)/welcome, NOT on a 401 / back-less view). |   |   |
| 6.3 | Sign back in. Trigger same deeplink via real notification or simulated. | Routes correctly to /seller/orders (gate passes for seller role). |   |   |

---

## Scenario 7 — Phase X end-to-end (visit ↔ buyer, shipped notif, share, contact, honest recharger)

Needs the Scenario-2 seller (with KYC approved) PLUS an agent account with a published property AND a buyer who has filed a visit request on that property. Push notifications work only on builds AFTER `google-services.json` lands — on the test APK without it, verify via the in-app Notifications screen instead.

| # | Step | Expected | Actual | P/F |
|---|---|---|---|---|
| 7.1 | Sign in as the agent. /pro/demandes → tap a pending visit → Accepter (or Refuser) with optional note. | Server returns 200. Notification dispatched server-side (notifyDetached). |   |   |
| 7.2 | Sign in as the buyer who filed that visit. Open the Notifications screen. | New row "Visite acceptée" (or "Visite refusée") visible. Tap → routes to `/buyer/requests` (NOT `/property/<id>` — X.1 deeplink flip). |   |   |
| 7.3 | `/buyer/requests` screen loads. | Header "Mes demandes". Status groups: "En attente", "Acceptées", "Refusées", "Annulées", "Terminées". The just-decided visit appears in the right group with the property snapshot card (title, district, price). |   |   |
| 7.4 | SQL: `select status, decided_at, agent_note from public.visit_requests where id='<visit_id>';` | status matches the agent's decision; decided_at not null; agent_note matches if entered. |   |   |
| 7.5 | Sign in as the seller from Scenario 2. /seller/orders → open a paid (not-yet-released) order → "Marquer expédiée" → enter tracking number "TEST-12345" + carrier "Jefa Delivery" → Submit. | Loading state visible. Toast "Commande marquée comme expédiée". Routes back to /seller/orders. Order pill flips from "À PRÉPARER" to "EN PRÉPARATION". | Pass via Achraf account, order LK-2026-10041 picked, carrier "Jefa Delivery", tracking "TEST-12345". Toast + auto-route + pill flip all observed. | ✅ |
| 7.6 | SQL: `select status, events from public.orders where id='<order_id>';` | status='preparing'. events JSON array contains one new element `{kind:'shipped', label:'Commande expédiée', tracking:'TEST-12345', carrier:'Manuel', at: <ISO>}`. | status='preparing' ✓. Event present : `{kind:'shipped', label:'Commande expédiée', tracking:'TEST-12345', carrier:'jefa', at:'2026-06-12T07:22:24.452Z'}`. **Finding** : carrier was stored as id `'jefa'` rather than label `'Jefa Delivery'`. **Resolved same session** (Phase X.12) — ship.tsx now resolves the carrier label via `CARRIERS.find().label` before submit. Next shipped order will store the human-readable label. | ✅ |
| 7.7 | Sign in as the buyer who placed that order. Open Notifications. | "Commande expédiée" row with tracking number in body. Tap → routes to `/order/<id>`. Order detail shows status "En préparation" with the shipped event in the timeline, AND the tracking number "TEST-12345 · Manuel" renders on its own line under the "En cours de remise" stage (X.9 event-identity matcher). |   |   |
| 7.8 | Same order detail, still as buyer. Verify the handoff window UI. | "Scanner le QR" CTA + "Signaler un problème" button BOTH visible (X.9 inHandoffWindow widening — pre-X9 they'd vanish the instant the seller marked the package shipped, leaving the buyer with no path to release escrow or open a dispute). |   |   |
| 7.9 | Same buyer, tap "Scanner le QR" → scan the QR printed for that order (or paste `linky://order/<id>/confirm?token=<scan_token>`). | /order/<id>/confirm loads with valid token ; hold-to-confirm enabled. |   |   |
| 7.10 | 5-second hold → confirmation animation. SQL: `select status from public.orders where id='<orderId>';` | status='released'. **This step proves the X.9 fix** : pre-X9 the RPC raised INVALID_STATUS because the order was in 'preparing', not 'paid'/'delivered'. The buyer's wallet credits + the seller's release credit land normally. |   |   |
| 7.11 | SQL ledger check: `select wallet_id, direction, amount_minor, ref_type from public.ledger_entries where ref_id='<orderId>' order by created_at;` | One credit to SELLER wallet for `amount_minor` (ref_type='order_release') ; one credit to PLATFORM wallet for `fees_minor` (ref_type='order_platform_fee'). Same ledger shape as Scenario 3.9 — `preparing` did NOT change the escrow split semantics. |   |   |
| 7.12 | **X.9 dispute path verification** : repeat 7.5 on a SECOND order, then as the buyer file a dispute (Order detail → "Signaler un problème" → pick a reason → submit). SQL: `select status from public.orders where id='<orderId>';` | status='disputed'. Pre-X9 the RPC would have raised INVALID_STATUS. |   |   |
| 7.13 | Probe: a non-seller user calls `/set-order-tracking` on the same order (use a logged-in buyer session). | Server returns 403 FORBIDDEN (only the order's seller can ship). |   |   |
| 7.14 | Probe: seller calls `/set-order-tracking` on an order whose status is NOT `paid` (e.g. an already-shipped or already-released one). | Server returns 400 INVALID_STATUS with French message. |   |   |
| 7.15 | From a product detail page, tap the share icon. | Native Share sheet opens. Message body contains the title + price; no URL line (intentional message-only until web/universal links exist). |   |   |
| 7.16 | From a shop page (multiple annonces), tap the share icon. | Same Share sheet pattern. |   |   |
| 7.17 | From the same shop page, tap "Message". | Routes to /messages/<convId> with the seller. Sending a test message persists (verify via SQL or other side). |   |   |
| 7.18 | Wallet → "Recharger". | Honest "Bientôt disponible" surface (badge "BIENTÔT", title, explanatory copy). NO amount picker, NO method picker, NO submit button. Two CTAs: "Voir le marché" + "Retour au portefeuille". The "pay by card at checkout" pointer is visible. |   |   |
| 7.19 | Settings → Adresses (and Settings → Téléphones). | Both show the honest "Bientôt" card with dashed border + BIENTÔT badge. No dead "Ajouter" button. |   |   |
| 7.20 | Settings → Aide → "Signaler un bug" (or "Signaler un problème de sécurité"). | OS mail client opens with `support@linky.gn` (or `security@linky.gn`) and a structured subject pre-filled. |   |   |
| 7.21 | Settings → Confidentialité → "Télécharger mes données" (and "Supprimer mon compte"). | OS mail client opens with `support@linky.gn` and the GDPR-styled subject pre-filled. |   |   |
| 7.22 | Settings → Aide → status banner (linky.gn/status). | Browser opens `https://linky.gn/status`. |   |   |
| 7.23 | Settings → Préférences → Économiseur de données → toggle ON. | Open Découvrir; any property card with a video URL shows the "Visite vidéo · en pause" hint and does NOT autoplay. Toggle OFF → autoplay resumes on next card surface. |   |   |
| 7.24 | Settings → Apparence → switch to Sombre. | Navigation, cards, text colors invert through useTheme. No screen with a hardcoded light background remains visible (audited screens: buyer/requests, recharger, payouts, messagerie, ship). |   |   |
| 7.25 | **X.9 visit-request cache refresh**. Sign in as a buyer who has NEVER filed a visit before. Open a property → "Demander une visite" → submit. After the success toast, the buyer is replaced onto `/buyer/requests`. | The new visit request appears immediately in the "En attente" group with the property snapshot card. Pre-X9 the cached pre-request fetch was reused and the new row was missing, silently contradicting the toast. |   |   |

---

## Tally

| Scenario | Passes | Fails | Skips |
|---|---|---|---|
| 1 Pure buyer |   |   |   |
| 2 Upgrade |   |   |   |
| 3 Money |   |   |   |
| 4 Dispute |   |   |   |
| 5 States |   |   |   |
| 6 Deeplinks |   |   |   |
| 7 Phase X e2e |   |   |   |
| **TOTAL** |   |   |   |

Date run: ____ Tester: ____ Build: ____
