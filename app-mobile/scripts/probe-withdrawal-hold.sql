-- ===========================================================================
-- SONDE : un retrait se valide seul, retient les fonds, et ne les retire
--         qu'UNE fois
-- ===========================================================================
--
-- CE QUI A CHANGÉ (20260929_08). La demande de retrait était posée `pending` et
-- attendait qu'un administrateur tranche ; le débit n'avait lieu qu'au moment
-- où il cochait « payé » — c'est-à-dire APRÈS avoir déjà envoyé l'argent pour
-- de vrai. Entre sa vérification et son virement, le vendeur pouvait dépenser
-- son solde, et la fonction levait alors `insufficient_funds` sur de l'argent
-- déjà parti. La perte était pour Linky.
--
-- `request_withdrawal` valide maintenant elle-même et RETIENT les fonds
-- (`withdrawal_hold`). Le back-office n'a plus qu'à envoyer et confirmer.
--
-- CE QUE LA SONDE PROUVE :
--   1. la demande naît `approved` et le solde baisse IMMÉDIATEMENT ;
--   2. on ne peut pas demander deux fois le même argent (la seconde demande
--      est refusée sur le solde déjà amputé) ;
--   3. cocher « payé » ne débite PAS une seconde fois — c'est le point le plus
--      dangereux du lot, et le plus facile à rater ;
--   4. refuser une demande validée REND les fonds retenus ;
--   5. une demande `pending` d'avant la migration garde l'ancien chemin, avec
--      son débit au paiement (aucune reprise de données nécessaire) ;
--   6. une destination sans numéro est refusée par la BASE, pas seulement par
--      la fonction edge.
--
-- SON CONTRÔLE NÉGATIF, ET CE QU'IL MONTRE VRAIMENT. En retirant la garde
-- `and v_req.status = 'pending'` du chemin de paiement, la sonde échoue —
-- mais PAS sur le message que j'attendais. Mesure du 2026-09-28 :
--
--     insufficient_funds — DETAIL: balance 56560 < amount 60000
--     dans process_withdrawal, appelée par l'étape 3
--
-- Le second débit n'a pas lieu en silence : il trouve le solde déjà amputé par
-- la retenue et refuse. C'est exactement ce que l'administrateur verrait en
-- production, APRÈS avoir envoyé l'argent pour de vrai — la demande refuse de
-- se clore et il ne comprend pas pourquoi. Et si le solde avait suffi, le débit
-- serait passé : le vendeur aurait payé deux fois son propre retrait.
--
-- La garde est donc porteuse dans les deux sens, et c'est le contrôle négatif
-- qui l'a montré, pas la lecture du code.
--
-- COMMENT LA LANCER : éditeur SQL Supabase, ou POST .../database/query. Elle se
-- termine par `rollback` — rien ne subsiste, ni le portefeuille d'essai, ni les
-- demandes, ni les écritures du grand livre. Elle EMPRUNTE un vrai utilisateur
-- et un vrai administrateur : c'est le rollback qui rend cela sans danger. Ne
-- jamais en faire une migration, ne jamais remplacer sa dernière ligne par
-- `commit`.
--
-- ⚠️ L'utilisateur emprunté a DÉJÀ un solde, qui n'est pas le même d'un jour à
-- l'autre. Toutes les attentes sont donc RELATIVES à un point de départ mesuré
-- (`v_start`), jamais absolues — une sonde qui suppose un portefeuille vide
-- échoue pour une raison qui n'a rien à voir avec ce qu'elle teste.
-- ===========================================================================

begin;

do $t$
declare
  v_user    uuid;
  v_admin   uuid;
  v_wallet  uuid;
  v_req     uuid;
  v_req2    uuid;
  v_bal     bigint;
  v_start   bigint;   -- le solde APRES le credit d'essai : l'origine des mesures
  v_msg     text;
  DEST      constant text := 'Orange Money - 622 33 44 55';
begin
  select id into v_admin from public.users where is_admin order by created_at limit 1;
  select id into v_user  from public.users where coalesce(is_admin, false) = false
                                              and id <> v_admin order by created_at limit 1;
  if v_admin is null or v_user is null then raise exception 'pas de jeu de donnees'; end if;

  -- Un portefeuille d'essai, credite de 100 000. On ecrit directement au grand
  -- livre : c'est la meme convention que partout (balance_after courant), et
  -- tout part au rollback.
  insert into public.wallets (user_id, kind, currency)
       values (v_user, 'seller', 'GNF')
  on conflict (user_id, kind, currency) do nothing;
  select id into v_wallet from public.wallets
   where user_id = v_user and kind = 'seller' and currency = 'GNF';
  v_bal := coalesce((select balance_after from public.ledger_entries
                      where wallet_id = v_wallet order by created_at desc, id desc limit 1), 0);
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
       values (v_wallet, 'credit', 100000, v_bal + 100000, 'credit', gen_random_uuid());
  v_start := v_bal + 100000;

  -- ══════════════════════════════════════════════════════════════════════
  -- 6 (d'abord, c'est le moins cher) : une destination sans numero est refusee
  -- ══════════════════════════════════════════════════════════════════════
  begin
    perform public.request_withdrawal(v_user, 'GNF', 1000, 'Orange Money', 'seller');
    raise exception 'ECHEC : une demande SANS NUMERO a ete acceptee';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'destination_required' then raise; end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════
  -- 1 : la demande naît validee, et le solde baisse TOUT DE SUITE
  -- ══════════════════════════════════════════════════════════════════════
  select id into v_req from public.request_withdrawal(v_user, 'GNF', 60000, DEST, 'seller');
  if (select status from public.withdrawal_requests where id = v_req) <> 'approved' then
    raise exception 'ECHEC : la demande n-est pas validee automatiquement';
  end if;
  if (select decided_by from public.withdrawal_requests where id = v_req) is not null then
    raise exception 'ECHEC : un administrateur est credite d-une decision automatique';
  end if;
  v_bal := coalesce((select balance_after from public.ledger_entries
                      where wallet_id = v_wallet order by created_at desc, id desc limit 1), 0);
  if v_bal <> v_start - 60000 then
    raise exception 'ECHEC : les fonds ne sont pas retenus (solde = %, attendu %)', v_bal, v_start - 60000;
  end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- 2 : on ne demande pas deux fois le meme argent
  -- ══════════════════════════════════════════════════════════════════════
  begin
    -- On demande TOUT le reste PLUS UN : la seule facon de tester le refus
    -- sans connaitre le solde de depart de l'utilisateur emprunte.
    perform public.request_withdrawal(v_user, 'GNF', (v_start - 60000) + 1, DEST, 'seller');
    raise exception 'ECHEC : plus que le solde disponible a ete retenu';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'insufficient_funds' then raise; end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════
  -- 3 : LE POINT DANGEREUX — cocher « paye » ne debite pas une seconde fois
  -- ══════════════════════════════════════════════════════════════════════
  perform public.process_withdrawal(v_req, v_admin, 'paid', null);
  if (select status from public.withdrawal_requests where id = v_req) <> 'paid' then
    raise exception 'ECHEC : la demande n-est pas passee a paid';
  end if;
  v_bal := coalesce((select balance_after from public.ledger_entries
                      where wallet_id = v_wallet order by created_at desc, id desc limit 1), 0);
  if v_bal <> v_start - 60000 then
    raise exception 'DOUBLE DEBIT : solde = % apres paiement, attendu %', v_bal, v_start - 60000;
  end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- 4 : refuser une demande validee REND les fonds
  -- ══════════════════════════════════════════════════════════════════════
  select id into v_req2 from public.request_withdrawal(v_user, 'GNF', 25000, DEST, 'seller');
  v_bal := coalesce((select balance_after from public.ledger_entries
                      where wallet_id = v_wallet order by created_at desc, id desc limit 1), 0);
  if v_bal <> v_start - 85000 then
    raise exception 'ECHEC : retenue de la 2e demande (solde = %, attendu %)', v_bal, v_start - 85000;
  end if;

  perform public.process_withdrawal(v_req2, v_admin, 'rejected', 'numero invalide');
  v_bal := coalesce((select balance_after from public.ledger_entries
                      where wallet_id = v_wallet order by created_at desc, id desc limit 1), 0);
  if v_bal <> v_start - 60000 then
    raise exception 'ECHEC : le rejet n-a pas rendu les fonds (solde = %, attendu %)', v_bal, v_start - 60000;
  end if;

  -- Et il ne les rend pas deux fois : la demande est close.
  begin
    perform public.process_withdrawal(v_req2, v_admin, 'rejected', 'encore');
    raise exception 'ECHEC : une demande close a ete re-traitee';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'request_closed' then raise; end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════
  -- 5 : une demande d'AVANT la migration garde son ancien chemin
  -- ══════════════════════════════════════════════════════════════════════
  insert into public.withdrawal_requests (user_id, currency, amount_minor, destination, wallet_kind, status)
       values (v_user, 'GNF', 10000, DEST, 'seller', 'pending')
    returning id into v_req2;
  v_bal := coalesce((select balance_after from public.ledger_entries
                      where wallet_id = v_wallet order by created_at desc, id desc limit 1), 0);
  if v_bal <> v_start - 60000 then
    raise exception 'ECHEC : une demande pending a retenu des fonds (solde = %, attendu %)', v_bal, v_start - 60000;
  end if;

  perform public.process_withdrawal(v_req2, v_admin, 'paid', null);
  v_bal := coalesce((select balance_after from public.ledger_entries
                      where wallet_id = v_wallet order by created_at desc, id desc limit 1), 0);
  if v_bal <> v_start - 70000 then
    raise exception 'ECHEC : l-ancien chemin ne debite plus au paiement (solde = %, attendu %)', v_bal, v_start - 70000;
  end if;

  raise notice 'validation automatique, retenue, paiement sans double debit, rejet qui rend';
end
$t$;

rollback;
