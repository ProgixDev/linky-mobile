-- ===========================================================================
-- PORTEFEUILLE LIVREUR — les frais de livraison vont au livreur
-- 2026-10-31 — client : « add a wallet on the home page like Linky to able
-- deliver men to withdraw their delivery money ».
-- ===========================================================================
--
-- AVANT : à chaque remise de colis, les frais de livraison payés par
-- l'acheteur (3 000 GNF/km, minimum 15 000) partaient du séquestre vers la
-- plateforme (transfert 'order_platform_fee', avec la commission). Aucun
-- livreur n'avait de solde.
--
-- DÉCISIONS D'ACHRAF (2026-10-31) :
--   - le livreur touche 100 % des frais de livraison de la commande ;
--   - seulement pour une commande PAYÉE DANS L'APP. En espèces, aucun argent
--     ne passe par Linky : le livreur encaisse déjà ses frais en main.
--
-- ┌─ POURQUOI UN TRANSFERT EN PLUS, ET PAS UNE RÉÉCRITURE DES LIBÉRATIONS ──┐
-- Quatre fonctions libèrent une commande (confirm_order_receipt,
-- livreur_confirm_handoff, resolve_dispute, admin_force_resolve_order) et
-- leurs corps en prod ont divergé du dépôt. On n'y touche pas : elles
-- continuent de verser frais de service + frais de livraison à la
-- plateforme. Un déclencheur, une fois la commande libérée ET la livraison
-- confirmée, fait suivre les frais de livraison de la plateforme au livreur.
-- Une seule écriture de plus, au même endroit pour tous les chemins.
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- QUAND LE LIVREUR EST PAYÉ : quand la livraison est 'delivered', c'est-à-dire
-- quand il a scanné le QR du client (livreur_confirm_handoff, seul chemin qui
-- pose ce statut). Si un autre chemin libère la commande sans remise
-- confirmée (litige tranché, déblocage admin...), rien ne part : un humain
-- décide.
--
-- PAS DE RÉTROACTIF : seules les livraisons confirmées à partir du
-- 2026-10-31 sont payées. L'unique livraison antérieure (LK-2026-10070, du
-- 2026-08-22, 15 000 GNF) reste à la plateforme : déplacer de l'argent déjà
-- réglé est une décision à part.
--
-- L'APP LINKY NE MONTRE PAS LA CAISSE LIVREUR : un livreur qui a aussi un
-- compte Linky verrait sinon cet argent dans l'historique de son portefeuille
-- Linky, d'où il ne peut pas le retirer. Il le retire depuis Dépose.
-- get_wallet_balances, elle, continue de TOUT compter : c'est elle qui
-- empêche de supprimer un compte qui a encore de l'argent.

begin;

-- ── 1. Une troisième caisse : 'livreur' ───────────────────────────────────
alter table public.wallets drop constraint wallets_kind_check;
alter table public.wallets add constraint wallets_kind_check
  check (kind = any (array['seller'::text, 'immo'::text, 'livreur'::text]));

alter table public.withdrawal_requests drop constraint withdrawal_requests_wallet_kind_check;
alter table public.withdrawal_requests add constraint withdrawal_requests_wallet_kind_check
  check (wallet_kind = any (array['seller'::text, 'immo'::text, 'livreur'::text]));

-- ── 2. Chirurgie sur les corps EN PROD (jamais depuis le dépôt) ──────────
-- Les quatre corps visés sont entièrement ASCII (vérifié le 2026-10-31) :
-- les exécuter depuis un bloc DO ne peut pas casser de caractère.
do $surgery$
declare
  v_src text;
  v_new text;
  r record;
begin
  for r in
    select * from (values
      ('public.user_wallet(uuid,text,text)',
       $a$if p_kind not in ('seller', 'immo') then$a$,
       $b$if p_kind not in ('seller', 'immo', 'livreur') then$b$),
      ('public.request_withdrawal(uuid,text,bigint,text,text)',
       $a$if p_wallet_kind not in ('seller', 'immo') then$a$,
       $b$if p_wallet_kind not in ('seller', 'immo', 'livreur') then$b$),
      ('public.get_wallet_history(uuid,timestamptz,uuid,integer)',
       $a$where w.user_id = p_user_id$a$,
       $b$where w.user_id = p_user_id
    and w.kind <> 'livreur'$b$),
      ('public.get_wallet_origin_breakdown(uuid)',
       $a$where w.user_id = p_user_id$a$,
       $b$where w.user_id = p_user_id
     and w.kind <> 'livreur'$b$)
    ) as t(sig, anchor, replacement)
  loop
    v_src := pg_get_functiondef(r.sig::regprocedure);
    -- L'ancre doit exister UNE fois : zéro = corps inattendu, deux = ambigu.
    if (length(v_src) - length(replace(v_src, r.anchor, ''))) / length(r.anchor) <> 1 then
      raise exception 'chirurgie % : ancre trouvee % fois', r.sig,
        (length(v_src) - length(replace(v_src, r.anchor, ''))) / length(r.anchor);
    end if;
    v_new := replace(v_src, r.anchor, r.replacement);
    execute v_new;
  end loop;
end
$surgery$;

-- ── 3. Une seule paie par commande, garantie par la base ─────────────────
create unique index if not exists ledger_entries_livreur_fee_once
  on public.ledger_entries (ref_id)
  where ref_type = 'livreur_delivery_fee' and direction = 'credit';

-- ── 4. Payer le livreur d'une commande ────────────────────────────────────
-- Idempotente : rappelée autant qu'on veut, elle ne paie qu'une fois. Elle
-- rend la raison pour laquelle elle ne paie pas, pour la sonde et pour qui
-- enquête.
create or replace function public.pay_livreur_delivery_fee(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  -- Pas de retroactif : voir l'en-tete de la migration 20261031_01.
  c_cutoff constant timestamptz := '2026-10-31 00:00:00+00';
  v_order          record;
  v_delivery       record;
  v_platform       uuid;
  v_livreur_wallet uuid;
begin
  -- Le verrou de la commande serialise deux appels (declencheur + rattrapage).
  select id, status, payment_method, currency, delivery_fee_minor, seller_id, buyer_id
    into v_order
    from public.orders
   where id = p_order_id
   for update;
  if not found then return 'no_order'; end if;
  if v_order.status <> 'released' then return 'not_released'; end if;
  -- Especes et dons : rien n'est passe par le sequestre.
  if v_order.payment_method in ('cod', 'gift') then return 'no_money_in_escrow'; end if;
  if v_order.currency <> 'GNF' then return 'not_gnf'; end if;
  if coalesce(v_order.delivery_fee_minor, 0) <= 0 then return 'no_fee'; end if;

  select id, livreur_id, status, delivered_at
    into v_delivery
    from public.deliveries
   where order_id = p_order_id;
  if not found or v_delivery.livreur_id is null then return 'no_livreur'; end if;
  -- Paye quand IL a remis le colis (scan du QR client), pas avant.
  if v_delivery.status <> 'delivered' then return 'not_delivered'; end if;
  if v_delivery.delivered_at is null or v_delivery.delivered_at < c_cutoff then
    return 'before_cutoff';
  end if;
  if v_delivery.livreur_id = v_order.seller_id or v_delivery.livreur_id = v_order.buyer_id then
    return 'livreur_is_counterparty';
  end if;

  if exists (select 1 from public.ledger_entries
              where ref_type = 'livreur_delivery_fee'
                and ref_id = p_order_id
                and direction = 'credit') then
    return 'already_paid';
  end if;

  select id into v_platform
    from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000002'
     and kind = 'seller' and currency = 'GNF';
  if v_platform is null then raise exception 'PLATFORM_WALLET_MISSING'; end if;

  -- LA PLATEFORME DOIT AVOIR ENCAISSE CES FRAIS. Sans cette garde, une
  -- commande liberee par un chemin qui n'aurait pas verse les frais de
  -- livraison ferait payer le livreur avec l'argent d'autres commandes.
  if not exists (select 1 from public.ledger_entries
                  where wallet_id = v_platform
                    and ref_type = 'order_platform_fee'
                    and ref_id = p_order_id
                    and direction = 'credit'
                    and amount_minor >= v_order.delivery_fee_minor) then
    return 'fee_not_collected';
  end if;

  v_livreur_wallet := public.user_wallet(v_delivery.livreur_id, 'livreur', 'GNF');
  perform public.post_transfer(
    v_platform, v_livreur_wallet, v_order.delivery_fee_minor,
    'livreur_delivery_fee', p_order_id
  );
  return 'paid';
end
$fn$;

comment on function public.pay_livreur_delivery_fee(uuid) is
  'Fait suivre les frais de livraison d''une commande liberee de la plateforme '
  'au livreur qui a confirme la remise. Idempotente ; rend la raison d''un '
  'non-paiement. Migration 20261031_01.';

-- ── 5. Les déclencheurs : à la libération, et à la remise ─────────────────
-- Dans livreur_confirm_handoff la livraison passe 'delivered' AVANT que la
-- commande passe 'released' : c'est le declencheur de la commande qui paie.
-- Celui de la livraison couvre un ordre inverse, s'il apparaissait un jour.
--
-- UN ECHEC NE BLOQUE JAMAIS LA REMISE. Le livreur est devant le client : si
-- la paie echouait, toute la liberation serait annulee avec elle. L'erreur
-- est donc rattrapee (sous-transaction), journalisee, et le rattrapage
-- horaire (section 6) reessaie.
create or replace function public.trg_pay_livreur_on_order_release()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  begin
    perform public.pay_livreur_delivery_fee(new.id);
  exception when others then
    raise warning 'pay_livreur_delivery_fee(%) : %', new.id, sqlerrm;
  end;
  return null;
end
$fn$;

create or replace function public.trg_pay_livreur_on_delivered()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  begin
    perform public.pay_livreur_delivery_fee(new.order_id);
  exception when others then
    raise warning 'pay_livreur_delivery_fee(%) : %', new.order_id, sqlerrm;
  end;
  return null;
end
$fn$;

drop trigger if exists trg_pay_livreur_on_order_release on public.orders;
create trigger trg_pay_livreur_on_order_release
  after update of status on public.orders
  for each row
  when (new.status = 'released' and old.status is distinct from new.status)
  execute function public.trg_pay_livreur_on_order_release();

drop trigger if exists trg_pay_livreur_on_delivered on public.deliveries;
create trigger trg_pay_livreur_on_delivered
  after update of status on public.deliveries
  for each row
  when (new.status = 'delivered' and old.status is distinct from new.status)
  execute function public.trg_pay_livreur_on_delivered();

-- ── 6. Le rattrapage, chaque heure ────────────────────────────────────────
create or replace function public.pay_pending_livreur_fees()
returns integer
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  r      record;
  v_out  text;
  v_paid integer := 0;
begin
  for r in
    select o.id
      from public.orders o
      join public.deliveries d on d.order_id = o.id
     where o.status = 'released'
       and d.status = 'delivered'
       and d.livreur_id is not null
       and coalesce(o.delivery_fee_minor, 0) > 0
       and o.payment_method not in ('cod', 'gift')
       and not exists (select 1 from public.ledger_entries le
                        where le.ref_type = 'livreur_delivery_fee'
                          and le.ref_id = o.id
                          and le.direction = 'credit')
  loop
    begin
      v_out := public.pay_livreur_delivery_fee(r.id);
      if v_out = 'paid' then v_paid := v_paid + 1; end if;
    exception when others then
      raise warning 'pay_pending_livreur_fees % : %', r.id, sqlerrm;
    end;
  end loop;
  return v_paid;
end
$fn$;

select cron.schedule('linky-pay-livreurs', '17 * * * *', 'select public.pay_pending_livreur_fees();');

-- ── 7. Droits — Supabase re-accorde EXECUTE par defaut (durcissement 2026-07-29)
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('pay_livreur_delivery_fee', 'pay_pending_livreur_fees',
                         'trg_pay_livreur_on_order_release', 'trg_pay_livreur_on_delivered')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$grants$;

-- ── 8. Contrôle ───────────────────────────────────────────────────────────
do $check$
declare
  v_src  text;
  v_sig  text;
  v_need text;
begin
  -- Les quatre corps operes portent leur modification, sans caractere casse.
  for v_sig, v_need in
    select * from (values
      ('public.user_wallet(uuid,text,text)', $x$('seller', 'immo', 'livreur')$x$),
      ('public.request_withdrawal(uuid,text,bigint,text,text)', $x$('seller', 'immo', 'livreur')$x$),
      ('public.get_wallet_history(uuid,timestamptz,uuid,integer)', $x$w.kind <> 'livreur'$x$),
      ('public.get_wallet_origin_breakdown(uuid)', $x$w.kind <> 'livreur'$x$)
    ) as t(s, n)
  loop
    v_src := pg_get_functiondef(v_sig::regprocedure);
    if position(v_need in v_src) = 0 then raise exception '% : modification absente', v_sig; end if;
    if position(chr(65533) in v_src) > 0 then raise exception '% : CARACTERE CASSE', v_sig; end if;
  end loop;

  if position('livreur' in pg_get_constraintdef((select oid from pg_constraint where conname = 'wallets_kind_check'))) = 0 then
    raise exception 'wallets_kind_check sans livreur';
  end if;
  if position('livreur' in pg_get_constraintdef((select oid from pg_constraint where conname = 'withdrawal_requests_wallet_kind_check'))) = 0 then
    raise exception 'withdrawal_requests_wallet_kind_check sans livreur';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_pay_livreur_on_order_release') then
    raise exception 'declencheur de liberation absent';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_pay_livreur_on_delivered') then
    raise exception 'declencheur de remise absent';
  end if;
  if not exists (select 1 from cron.job where jobname = 'linky-pay-livreurs') then
    raise exception 'rattrapage horaire absent';
  end if;
  if has_function_privilege('authenticated', 'public.pay_livreur_delivery_fee(uuid)'::regprocedure, 'execute') then
    raise exception 'pay_livreur_delivery_fee executable par authenticated';
  end if;
  raise notice 'portefeuille livreur en place';
end
$check$;

notify pgrst, 'reload schema';

commit;
