-- 20260731_02_cutover_wipe_test_data.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- CUTOVER PRÉ-LANCEMENT — WIPE DES DONNÉES DE TEST (base propre pour la prod).
--
-- ⚠️⚠️  IRRÉVERSIBLE.  FAIS UN BACKUP AVANT DE LANCER  ⚠️⚠️
--        Supabase → Database → Backups (ou un snapshot / PITR).
--
-- Efface TOUTES les données de test : comptes, produits, biens, boutiques,
-- commandes, livraisons, réservations, messages, avis, favoris, wallets, ledger,
-- notifications, sessions, OTP… pour repartir d'une base vierge en production.
--
-- PRÉSERVE (volontairement) :
--   • public.geo_centroids .............. données de référence (villes) — INTACT
--   • 3 comptes + leurs wallets + emails/phones (identité de connexion) :
--       - 00000000-0000-0000-0000-000000000001  __system_escrow__   (séquestre)
--       - 00000000-0000-0000-0000-000000000002  __system_platform__ (frais Linky)
--       - 019f8996-a1b1-7f05-a195-c10af4e52c49  admin (accès dashboard)
--
-- Après ce wipe, le solde de TOUS les wallets (y compris système) repart à 0
-- (le solde est dérivé du ledger, qui est vidé).
--
-- NB : le compte de TEST mobile du client est supprimé — il se réinscrira comme
--      un vrai utilisateur au lancement. Le compte admin, lui, est conservé.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Le ledger est append-only (trigger ledger_entries_no_delete). On le désactive
-- uniquement le temps du wipe. C'est transactionnel : réactivé avant le commit,
-- et si la transaction échoue tout est annulé (y compris l'état du trigger).
alter table public.ledger_entries disable trigger ledger_entries_no_delete;

-- ── Phase 1 : tables feuilles / jonctions (aucune dépendance entrante restante) ──
delete from public.ledger_entries;
delete from public.payment_intents;
delete from public.deliveries;
delete from public.reviews;
delete from public.comment_likes;
delete from public.product_favorites;
delete from public.property_favorites;
delete from public.shop_followers;
delete from public.property_photos;
delete from public.visit_requests;
delete from public.messages;
delete from public.boosts;
delete from public.addresses;
delete from public.admin_actions;
delete from public.ai_generation_log;
delete from public.kyc_sessions;
delete from public.livreur_applications;
delete from public.notifications;
delete from public.otp_codes;
delete from public.push_tokens;
delete from public.sessions;
delete from public.signin_attempts;
delete from public.topup_intents;
delete from public.withdrawal_requests;
delete from public.idempotency_keys;
delete from public.mock_lengopay_state;

-- emails / phones : on garde ceux des 3 comptes préservés (identité de connexion)
delete from public.emails where user_id not in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '019f8996-a1b1-7f05-a195-c10af4e52c49');
delete from public.phones where user_id not in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '019f8996-a1b1-7f05-a195-c10af4e52c49');

-- ── Phase 2 : tables intermédiaires ──
delete from public.comments;       -- self-ref (parent_id) : le DELETE global gère
delete from public.bookings;
delete from public.orders;
delete from public.conversations;
delete from public.products;
delete from public.properties;
delete from public.shops;

-- ── Phase 3 : wallets puis users (préserver système + admin) ──
delete from public.wallets where user_id not in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '019f8996-a1b1-7f05-a195-c10af4e52c49');

delete from public.users where id not in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '019f8996-a1b1-7f05-a195-c10af4e52c49');

-- Réactive le garde append-only du ledger
alter table public.ledger_entries enable trigger ledger_entries_no_delete;

commit;

-- ── Vérification (attendu : users=3, wallets=4-5, tout le reste=0, geo_centroids intact) ──
select 'users'                    as table_, count(*) as rows_ from public.users
union all select 'wallets',                count(*) from public.wallets
union all select 'ledger_entries',         count(*) from public.ledger_entries
union all select 'orders',                 count(*) from public.orders
union all select 'products',               count(*) from public.products
union all select 'properties',             count(*) from public.properties
union all select 'shops',                  count(*) from public.shops
union all select 'deliveries',             count(*) from public.deliveries
union all select 'messages',               count(*) from public.messages
union all select 'geo_centroids (GARDE)',  count(*) from public.geo_centroids
order by 1;
