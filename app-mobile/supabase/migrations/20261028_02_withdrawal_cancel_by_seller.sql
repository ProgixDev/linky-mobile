-- ===========================================================================
-- LE VENDEUR PEUT ANNULER SON RETRAIT — TANT QUE L'ARGENT N'EST PAS PARTI
-- 2026-10-28 — demande du client : « dans la page retrait il faut ajouter un
-- bouton d'annulation de retrait »
-- ===========================================================================
--
-- Depuis 20260929_08, une demande naît `approved` et RETIENT les fonds
-- (`withdrawal_hold`). Annuler = rendre cette retenue (`withdrawal_release`,
-- le même crédit que le rejet admin) et passer la demande en `cancelled`
-- (statut déjà prévu par la contrainte, jamais utilisé jusqu'ici).
--
-- ┌─ LE SEUL VRAI DANGER : ANNULER UN RETRAIT DÉJÀ VERSÉ ───────────────────┐
-- Si le vendeur annule APRÈS que l'argent est parti vers son Mobile Money,
-- il récupère son solde ET garde le virement. Linky paie deux fois. Pire,
-- c'est exploitable exprès : il voit arriver le SMS de l'opérateur et annule
-- dans la seconde.
--
-- Versement AUTOMATIQUE (bouton « Verser ») : déjà couvert.
-- `claim_withdrawal_for_payout` pose `payout_claimed_at` SOUS VERROU avant
-- l'appel Lengopay ; l'annulation prend le MÊME verrou et refuse dès que
-- l'empreinte est posée. L'un des deux gagne, jamais les deux.
--
-- Virement MANUEL (« Viré à la main ») : PAS couvert jusqu'ici. L'admin
-- envoyait l'argent depuis son téléphone puis cliquait — aucune trace en base
-- AVANT le virement, donc rien pour arrêter une annulation entre les deux.
-- D'où les deux fonctions admin plus bas : on RÉSERVE la demande avant de
-- virer (même empreinte, marquée 'MANUAL'), et l'annulation est refusée.
-- La console passe à ce geste en deux temps dans le même lot.
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ⚠ Aucune fonction d'argent existante n'est touchée (cf. la dérive des
-- corps SQL) : `process_withdrawal`, `request_withdrawal` et le trio du
-- versement restent tels quels. On ajoute à côté.
--
-- ORDRE DES VERROUS : demande PUIS portefeuille, comme `process_withdrawal`.
-- `request_withdrawal` ne verrouille que le portefeuille (la demande n'existe
-- pas encore), `claim_withdrawal_for_payout` que la demande : aucun cycle.

begin;

-- ---------------------------------------------------------------------------
-- 1. L'ANNULATION PAR LE VENDEUR
-- ---------------------------------------------------------------------------
create or replace function public.cancel_withdrawal(
  p_request_id uuid,
  p_user_id    uuid
)
returns setof public.withdrawal_requests
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_req       record;
  v_wallet_id uuid;
  v_balance   bigint;
begin
  -- LE VERROU SUR LA DEMANDE D'ABORD. C'est lui qui serialise l'annulation
  -- avec la reservation d'un versement (claim / reservation manuelle) et avec
  -- la decision admin : chacun voit l'etat laisse par l'autre.
  select * into v_req
    from public.withdrawal_requests
   where id = p_request_id
   for update;

  -- La demande d'un autre = introuvable. On ne confirme pas son existence.
  if not found or v_req.user_id is distinct from p_user_id then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  -- Seule une demande validee, dont les fonds sont retenus, s'annule.
  -- Les 'pending' d'avant la retenue n'existent plus (et leur paiement
  -- manuel ne laisse aucune trace prealable : les annuler rouvrirait le trou).
  if v_req.status <> 'approved' then
    raise exception 'request_closed'
      using errcode = '22023', detail = 'request is ' || v_req.status;
  end if;

  -- L'ARGENT EST PEUT-ETRE DEJA PARTI. Versement Lengopay lance, ou virement
  -- manuel reserve : dans les deux cas, plus d'annulation possible.
  if v_req.payout_claimed_at is not null then
    raise exception 'payout_in_progress' using errcode = '22023';
  end if;

  -- On ne rend que ce qui a ete retenu, et une seule fois.
  if not exists (
    select 1 from public.ledger_entries
     where ref_type = 'withdrawal_hold' and ref_id = p_request_id
  ) then
    raise exception 'hold_missing' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.ledger_entries
     where ref_type = 'withdrawal_release' and ref_id = p_request_id
  ) then
    raise exception 'already_released' using errcode = '22023';
  end if;

  select id into v_wallet_id
    from public.wallets
   where user_id = v_req.user_id and kind = v_req.wallet_kind and currency = v_req.currency
   for update;
  if v_wallet_id is null then
    raise exception 'wallet_missing' using errcode = 'P0002';
  end if;

  v_balance := coalesce(
    (select balance_after from public.ledger_entries
      where wallet_id = v_wallet_id
      order by created_at desc, id desc limit 1), 0);

  -- LA RESTITUTION. Meme ecriture que le rejet admin : un seul nom pour
  -- « la retenue revient », que ce soit l'admin ou le vendeur qui l'ait voulu.
  insert into public.ledger_entries
    (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
  values
    (v_wallet_id, 'credit', v_req.amount_minor,
     v_balance + v_req.amount_minor, 'withdrawal_release', p_request_id);

  -- `decided_by` reste NUL : ce n'est pas un administrateur qui a tranche.
  update public.withdrawal_requests
     set status     = 'cancelled',
         decided_at = now(),
         updated_at = now()
   where id = p_request_id;

  return query select * from public.withdrawal_requests where id = p_request_id;
end
$fn$;

comment on function public.cancel_withdrawal(uuid, uuid) is
  'Le vendeur annule SON retrait approved : la retenue lui est rendue '
  '(withdrawal_release). Refuse des que payout_claimed_at est pose (versement '
  'Lengopay lance ou virement manuel reserve) : sinon il garderait le virement '
  'ET recupererait son solde.';

-- ---------------------------------------------------------------------------
-- 2. RÉSERVER AVANT UN VIREMENT MANUEL (console admin)
-- ---------------------------------------------------------------------------
-- Meme empreinte que le versement automatique (`payout_claimed_at`), donc :
--   - le vendeur ne peut plus annuler ;
--   - « Verser » est refuse (payout_already_claimed) : pas de double envoi
--     manuel + automatique.
-- `payout_status = 'MANUAL'` distingue cette reservation d'un versement
-- Lengopay en vol — seule la premiere peut etre relachee par un humain.
create or replace function public.reserve_withdrawal_for_manual_payout(
  p_request_id uuid,
  p_admin_id   uuid
)
returns setof public.withdrawal_requests
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_req    record;
  v_before jsonb;
  v_after  jsonb;
begin
  perform public.assert_admin(p_admin_id);

  select * into v_req
    from public.withdrawal_requests
   where id = p_request_id
   for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'approved' then
    raise exception 'request_not_payable'
      using errcode = '22023', detail = 'request is ' || v_req.status;
  end if;
  if v_req.payout_claimed_at is not null then
    raise exception 'payout_already_claimed' using errcode = '22023';
  end if;

  v_before := to_jsonb(v_req);

  update public.withdrawal_requests
     set payout_claimed_at = now(),
         payout_status     = 'MANUAL',
         payout_error      = null,
         updated_at        = now()
   where id = p_request_id;

  select to_jsonb(w.*) into v_after
    from public.withdrawal_requests w where w.id = p_request_id;

  insert into public.admin_actions (
    admin_id, target_type, target_id, action, reason, metadata,
    before_snapshot, after_snapshot
  ) values (
    p_admin_id, 'withdrawal_request', p_request_id, 'withdrawal.manual_reserved', null,
    jsonb_build_object('amount_minor', v_req.amount_minor, 'currency', v_req.currency,
                       'destination', v_req.destination),
    v_before, v_after
  );

  return query select * from public.withdrawal_requests where id = p_request_id;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 3. RELÂCHER UNE RÉSERVATION MANUELLE (l'admin n'a finalement pas viré)
-- ---------------------------------------------------------------------------
-- UNIQUEMENT une reservation 'MANUAL' sans pay_id. Un versement Lengopay
-- reserve ne se relache jamais ici : il est peut-etre parti (cf.
-- release_withdrawal_payout_claim, reserve a l'echec AVANT leur reponse).
create or replace function public.release_manual_withdrawal_reservation(
  p_request_id uuid,
  p_admin_id   uuid
)
returns setof public.withdrawal_requests
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_req    record;
  v_before jsonb;
  v_after  jsonb;
begin
  perform public.assert_admin(p_admin_id);

  select * into v_req
    from public.withdrawal_requests
   where id = p_request_id
   for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'approved'
     or v_req.payout_claimed_at is null
     or v_req.payout_status is distinct from 'MANUAL'
     or v_req.payout_pay_id is not null then
    raise exception 'not_manually_reserved' using errcode = '22023';
  end if;

  v_before := to_jsonb(v_req);

  -- `payout_status` repasse a NUL : 'MANUAL' doit vouloir dire « reservation
  -- manuelle EN COURS », rien d'autre. Laisse en place, il ferait prendre
  -- un futur versement Lengopay pour une reservation relachable.
  update public.withdrawal_requests
     set payout_claimed_at = null,
         payout_status     = null,
         updated_at        = now()
   where id = p_request_id;

  select to_jsonb(w.*) into v_after
    from public.withdrawal_requests w where w.id = p_request_id;

  insert into public.admin_actions (
    admin_id, target_type, target_id, action, reason, metadata,
    before_snapshot, after_snapshot
  ) values (
    p_admin_id, 'withdrawal_request', p_request_id, 'withdrawal.manual_released', null,
    jsonb_build_object('amount_minor', v_req.amount_minor, 'currency', v_req.currency),
    v_before, v_after
  );

  return query select * from public.withdrawal_requests where id = p_request_id;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 4. DROITS — Supabase re-accorde EXECUTE par defaut (durcissement 2026-07-29)
-- ---------------------------------------------------------------------------
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('cancel_withdrawal',
                         'reserve_withdrawal_for_manual_payout',
                         'release_manual_withdrawal_reservation')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------------------
-- 5. CONTRÔLE
-- ---------------------------------------------------------------------------
do $check$
declare v_src text; v_g text; v_miss text; v_fn text;
begin
  foreach v_fn in array array['cancel_withdrawal',
                              'reserve_withdrawal_for_manual_payout',
                              'release_manual_withdrawal_reservation'] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_src is null then raise exception '% absente', v_fn; end if;
    if position(chr(65533) in v_src) > 0 then
      raise exception '% : CARACTERE CASSE', v_fn;
    end if;
    if has_function_privilege('authenticated', (select p.oid from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = v_fn), 'execute') then
      raise exception '% : executable par authenticated', v_fn;
    end if;
  end loop;

  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_withdrawal';
  v_miss := null;
  foreach v_g in array array[
    'for update', 'request_not_found', 'request_closed', 'payout_in_progress',
    'payout_claimed_at is not null', 'hold_missing', 'already_released',
    '''withdrawal_release''', '''cancelled'''
  ] loop
    if position(v_g in v_src) = 0 then v_miss := coalesce(v_miss || ', ', '') || v_g; end if;
  end loop;
  if v_miss is not null then raise exception 'cancel_withdrawal : %', v_miss; end if;

  raise notice 'annulation vendeur + reservation manuelle en place';
end
$check$;

notify pgrst, 'reload schema';

commit;
