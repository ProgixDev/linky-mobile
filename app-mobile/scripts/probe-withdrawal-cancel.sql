-- ===========================================================================
-- SONDE : le vendeur annule son retrait — et JAMAIS un retrait déjà en route
-- ===========================================================================
--
-- CE QUI A CHANGÉ (20261028_02). Le vendeur peut annuler une demande
-- `approved` : la retenue lui est rendue (`withdrawal_release`). Le danger est
-- d'annuler un retrait dont l'argent est DÉJÀ parti : il garderait le virement
-- ET récupérerait son solde. D'où la garde `payout_claimed_at`, posée sous
-- verrou par le versement Lengopay comme par la nouvelle réservation manuelle.
--
-- CE QUE LA SONDE PROUVE :
--   1. la demande d'un AUTRE est introuvable (on ne l'annule pas) ;
--   2. annuler rend EXACTEMENT la retenue, une seule fois, sans admin crédité ;
--   3. une demande annulée ne se ré-annule pas, ne se rejette pas (pas de
--      double restitution) et ne se paie pas ;
--   4. une réservation MANUELLE bloque l'annulation ET le bouton « Verser » ;
--   5. relâcher la réservation manuelle rend l'annulation possible ;
--   6. un versement LENGOPAY réservé bloque l'annulation, et ne se relâche pas
--      comme une réservation manuelle ;
--   7. une demande `pending` d'avant la retenue ne s'annule pas.
--
-- SON CONTRÔLE NÉGATIF : passer NEG à true. La sonde retire alors la garde
-- `payout_claimed_at` de cancel_withdrawal (dans la transaction, donc annulé
-- au rollback) et DOIT échouer à l'étape 4 sur :
--     DOUBLE PAIEMENT : annulation acceptee alors qu-un virement manuel est reserve
-- Mesuré le 2026-10-28 avant application (migration + sonde dans la même
-- transaction) : vert sans NEG, rouge sur ce message exact avec NEG.
--
-- COMMENT LA LANCER : éditeur SQL Supabase, ou POST .../database/query. Elle se
-- termine par `rollback` — rien ne subsiste. Elle EMPRUNTE un vrai utilisateur
-- et un vrai administrateur : c'est le rollback qui rend cela sans danger. Ne
-- jamais remplacer sa dernière ligne par `commit`. Attentes RELATIVES au solde
-- mesuré au départ (`v_start`), comme probe-withdrawal-hold.sql.
-- ===========================================================================

begin;

do $t$
declare
  NEG       constant boolean := false;   -- true = controle negatif
  v_user    uuid;
  v_other   uuid;
  v_admin   uuid;
  v_wallet  uuid;
  v_req     uuid;
  v_bal     bigint;
  v_start   bigint;
  v_msg     text;
  v_src     text;
  DEST      constant text := 'Orange Money - 622 33 44 55';
begin
  select id into v_admin from public.users where is_admin order by created_at limit 1;
  select id into v_user  from public.users where coalesce(is_admin, false) = false
                                              and id <> v_admin order by created_at limit 1;
  select id into v_other from public.users where coalesce(is_admin, false) = false
                                              and id not in (v_admin, v_user) order by created_at limit 1;
  if v_admin is null or v_user is null or v_other is null then
    raise exception 'pas de jeu de donnees';
  end if;

  if NEG then
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cancel_withdrawal';
    if position('if v_req.payout_claimed_at is not null then' in v_src) = 0 then
      raise exception 'controle negatif : ancre introuvable';
    end if;
    execute replace(v_src, 'if v_req.payout_claimed_at is not null then', 'if false then');
    raise notice 'CONTROLE NEGATIF : garde payout_claimed_at retiree';
  end if;

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

  -- ══ 1 : la demande d'un autre est introuvable ═══════════════════════════
  select id into v_req from public.request_withdrawal(v_user, 'GNF', 40000, DEST, 'seller');
  begin
    perform public.cancel_withdrawal(v_req, v_other);
    raise exception 'ECHEC : un tiers a annule le retrait d-un autre';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'request_not_found' then raise; end if;
  end;

  -- ══ 2 : annuler rend exactement la retenue ══════════════════════════════
  perform public.cancel_withdrawal(v_req, v_user);
  if (select status from public.withdrawal_requests where id = v_req) <> 'cancelled' then
    raise exception 'ECHEC : la demande n-est pas cancelled';
  end if;
  if (select decided_by from public.withdrawal_requests where id = v_req) is not null then
    raise exception 'ECHEC : un administrateur est credite d-une annulation vendeur';
  end if;
  v_bal := coalesce((select balance_after from public.ledger_entries
                      where wallet_id = v_wallet order by created_at desc, id desc limit 1), 0);
  if v_bal <> v_start then
    raise exception 'ECHEC : solde % apres annulation, attendu %', v_bal, v_start;
  end if;
  if (select count(*) from public.ledger_entries
       where ref_type = 'withdrawal_release' and ref_id = v_req) <> 1 then
    raise exception 'ECHEC : il faut exactement UNE restitution';
  end if;

  -- ══ 3 : une demande annulee est close pour tout le monde ════════════════
  begin
    perform public.cancel_withdrawal(v_req, v_user);
    raise exception 'ECHEC : double annulation acceptee';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'request_closed' then raise; end if;
  end;
  begin
    perform public.process_withdrawal(v_req, v_admin, 'rejected', 'apres annulation');
    raise exception 'ECHEC : rejet d-une demande annulee (double restitution)';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'request_closed' then raise; end if;
  end;
  begin
    perform public.process_withdrawal(v_req, v_admin, 'paid', null);
    raise exception 'ECHEC : paiement d-une demande annulee';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'request_closed' then raise; end if;
  end;

  -- ══ 4 : une reservation MANUELLE bloque l'annulation et « Verser » ══════
  select id into v_req from public.request_withdrawal(v_user, 'GNF', 30000, DEST, 'seller');
  perform public.reserve_withdrawal_for_manual_payout(v_req, v_admin);
  if (select payout_status from public.withdrawal_requests where id = v_req) is distinct from 'MANUAL' then
    raise exception 'ECHEC : la reservation manuelle n-est pas marquee';
  end if;
  begin
    perform public.cancel_withdrawal(v_req, v_user);
    raise exception 'DOUBLE PAIEMENT : annulation acceptee alors qu-un virement manuel est reserve';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'payout_in_progress' then raise; end if;
  end;
  begin
    perform public.claim_withdrawal_for_payout(v_req);
    raise exception 'ECHEC : « Verser » accepte sur une demande reservee a la main';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'payout_already_claimed' then raise; end if;
  end;
  begin
    perform public.reserve_withdrawal_for_manual_payout(v_req, v_admin);
    raise exception 'ECHEC : double reservation manuelle';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'payout_already_claimed' then raise; end if;
  end;
  v_bal := coalesce((select balance_after from public.ledger_entries
                      where wallet_id = v_wallet order by created_at desc, id desc limit 1), 0);
  if v_bal <> v_start - 30000 then
    raise exception 'ECHEC : solde % pendant la reservation, attendu %', v_bal, v_start - 30000;
  end if;

  -- ══ 5 : relacher la reservation manuelle rend l'annulation possible ═════
  perform public.release_manual_withdrawal_reservation(v_req, v_admin);
  if (select payout_claimed_at is not null or payout_status is not null
        from public.withdrawal_requests where id = v_req) then
    raise exception 'ECHEC : la reservation n-est pas effacee';
  end if;
  perform public.cancel_withdrawal(v_req, v_user);
  v_bal := coalesce((select balance_after from public.ledger_entries
                      where wallet_id = v_wallet order by created_at desc, id desc limit 1), 0);
  if v_bal <> v_start then
    raise exception 'ECHEC : solde % apres relache + annulation, attendu %', v_bal, v_start;
  end if;

  -- ══ 6 : un versement LENGOPAY reserve bloque l'annulation ═══════════════
  select id into v_req from public.request_withdrawal(v_user, 'GNF', 20000, DEST, 'seller');
  perform public.claim_withdrawal_for_payout(v_req);
  begin
    perform public.cancel_withdrawal(v_req, v_user);
    raise exception 'DOUBLE PAIEMENT : annulation acceptee pendant un versement Lengopay';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'payout_in_progress' then raise; end if;
  end;
  begin
    perform public.release_manual_withdrawal_reservation(v_req, v_admin);
    raise exception 'ECHEC : un versement Lengopay relache comme une reservation manuelle';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'not_manually_reserved' then raise; end if;
  end;

  -- ══ 7 : une demande pending d'avant la retenue ne s'annule pas ══════════
  insert into public.withdrawal_requests (user_id, currency, amount_minor, destination, wallet_kind, status)
       values (v_user, 'GNF', 10000, DEST, 'seller', 'pending')
    returning id into v_req;
  begin
    perform public.cancel_withdrawal(v_req, v_user);
    raise exception 'ECHEC : une demande pending (rien de retenu) a ete annulee';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'request_closed' then raise; end if;
  end;

  raise notice 'annulation : rend la retenue une fois, jamais pendant un versement';
end
$t$;

rollback;
