-- ============================================================================
-- PRE-LAUNCH CUTOVER WIPE — DO NOT RUN WHILE THE CLIENT IS STILL TESTING.
-- ============================================================================
-- Run ONCE, right before real users arrive. Every GNF in the system today is
-- fake (demo-seed 100M credits + Stripe TEST charges), so this deletes ALL
-- transactional data and test accounts while preserving:
--   - the schema, all functions/triggers/crons,
--   - the admin account(s) (users.is_admin = true),
--   - the system escrow/platform users + their (empty) wallets,
--   - catalog reference data? NO — test listings/shops go too (they belong to
--     test users). The client re-creates real listings at launch.
--
-- Apply via the Supabase SQL editor or the Management API (db push is
-- unusable on this project). Single transaction: all-or-nothing.
--
-- After running: verify with the SELECTs at the bottom, then rebuild nothing —
-- no app change is needed (the demo-seed trigger was already removed by
-- migration 20260701_03, so fresh wallets start at 0).
-- ============================================================================

begin;

-- ---- 1. Notification / messaging / social surfaces ------------------------
delete from public.notifications;
delete from public.push_tokens;
delete from public.messages;
delete from public.conversations;
delete from public.comments;
delete from public.reviews;
delete from public.product_favorites;
delete from public.property_favorites;
delete from public.shop_followers;
delete from public.ai_generation_log;
delete from public.mock_lengopay_state;

-- ---- 2. Logistics / visits / bookings --------------------------------------
delete from public.deliveries;
delete from public.livreur_applications;
delete from public.visit_requests;
delete from public.bookings;

-- ---- 3. Commerce -----------------------------------------------------------
delete from public.boosts;
delete from public.orders;
delete from public.payment_intents;
delete from public.topup_intents;
delete from public.withdrawal_requests;

-- ---- 4. Money (append-only in prod, but the whole book is fake) ------------
delete from public.ledger_entries;
delete from public.wallets;

-- ---- 5. Catalog (test users' shops + listings) ------------------------------
delete from public.property_photos;
delete from public.properties;
delete from public.products;
delete from public.shops;

-- ---- 6. Identity / auth (keep admins + system users) ------------------------
delete from public.kyc_sessions;
delete from public.otp_codes;
delete from public.signin_attempts;
delete from public.sessions
 where user_id not in (select id from public.users where is_admin);
delete from public.phones
 where user_id not in (select id from public.users where is_admin);
delete from public.emails
 where user_id not in (select id from public.users where is_admin);
delete from public.addresses
 where user_id not in (select id from public.users where is_admin);
delete from public.admin_actions;
delete from public.users
 where not is_admin
   and id not in ('00000000-0000-0000-0000-000000000001',
                  '00000000-0000-0000-0000-000000000002');

-- ---- 7. Recreate the system wallets (empty) ---------------------------------
insert into public.wallets (user_id, currency)
values
  ('00000000-0000-0000-0000-000000000001', 'GNF'),
  ('00000000-0000-0000-0000-000000000001', 'EUR'),
  ('00000000-0000-0000-0000-000000000002', 'GNF'),
  ('00000000-0000-0000-0000-000000000002', 'EUR')
on conflict (user_id, currency) do nothing;

commit;

-- ---- Verification (run after commit) ----------------------------------------
-- select count(*) as users_left from public.users;              -- admins + 2 system
-- select count(*) as ledger_rows from public.ledger_entries;    -- 0
-- select count(*) as wallets from public.wallets;               -- 4 (+admin's if lazily recreated later)
-- select count(*) as orders from public.orders;                 -- 0
