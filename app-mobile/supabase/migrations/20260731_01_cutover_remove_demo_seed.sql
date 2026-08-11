-- 20260731_01_cutover_remove_demo_seed.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- CUTOVER PRÉ-LANCEMENT (production Google Play).
--
-- Supprime l'échafaudage de test `demo_seed_new_wallet` : à chaque création
-- d'un wallet GNF, il créditait automatiquement **100 000 000 GNF fictifs** via
-- un topup_intent. Indispensable à retirer AVANT toute publication publique —
-- sinon n'importe quel inscrit se crédite 100M (et pourrait demander un retrait
-- fictif). Ne touche à AUCUN wallet réel : retire juste le trigger + sa fonction.
--
-- ⚠️ Les wallets de TEST déjà crédités (avant cette migration) gardent leur
-- solde fictif — à nettoyer séparément avant le lancement (décision owner :
-- wipe des données de test / repartir d'une base propre).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

drop trigger if exists demo_seed_new_wallet_trg on public.wallets;
drop function if exists public.demo_seed_new_wallet();

commit;
