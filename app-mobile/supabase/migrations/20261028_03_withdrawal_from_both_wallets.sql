-- ===========================================================================
-- RETIRER DEPUIS LES DEUX CAISSES — VENDEUR ET IMMO
-- 2026-10-28 — client : « Il y a 57 400, mais je ne peux retirer que 18 400.
-- Au moment du retrait seul le solde vendeur est disponible, le solde Immo
-- n'est pas pris en compte. »
-- ===========================================================================
--
-- Le Portefeuille affiche le TOTAL des deux caisses (20260924), mais
-- `wallet-withdraw-request` appelait `request_withdrawal(..., 'seller')` en
-- dur. Mesure en prod ce jour : le client a Vendeur 18 400 + Immo 39 000, et
-- un second compte n'a QUE de l'Immo (12 000) — pour lui l'écran Retirer dit
-- « Aucun solde à retirer ». Un agent immobilier ne pouvait rien retirer.
--
-- ┌─ POURQUOI DEUX DEMANDES ET PAS UNE ─────────────────────────────────────┐
-- Une demande porte UNE caisse (`wallet_kind`) et tout ce qui la suit en
-- dépend : la retenue, la restitution au rejet (`process_withdrawal`), à
-- l'annulation (`cancel_withdrawal`), le solde montré à la console, le
-- versement Lengopay. Une demande à cheval sur deux caisses obligerait à
-- réécrire `process_withdrawal` — fonction d'argent dont le corps en prod a
-- divergé du dépôt. On ne la touche pas : on pose UNE demande PAR caisse,
-- dans la MÊME transaction, via `request_withdrawal` inchangée.
-- Conséquence assumée : un retrait de 57 400 donne deux lignes (18 400 +
-- 39 000) et deux virements vers le même numéro.
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ORDRE : la caisse Vendeur d'abord, l'Immo complète. VERROUS : les deux
-- portefeuilles, dans un ordre FIXE (immo puis seller), AVANT de lire les
-- soldes — deux retraits simultanés se sérialisent ici et ne peuvent pas
-- retenir deux fois le même argent. `request_withdrawal` reprend ensuite le
-- verrou de sa caisse (déjà détenu : sans effet) et revérifie le solde.

begin;

create or replace function public.request_withdrawal_total(
  p_user_id      uuid,
  p_currency     text,
  p_amount_minor bigint,
  p_destination  text
)
returns setof public.withdrawal_requests
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_immo_id     uuid;
  v_seller_id   uuid;
  v_immo        bigint := 0;
  v_seller      bigint := 0;
  v_from_seller bigint;
  v_from_immo   bigint;
begin
  if p_currency not in ('GNF', 'EUR') then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- LES DEUX VERROUS D'ABORD, ordre fixe. Une caisse absente n'a rien a
  -- verrouiller et vaut 0.
  select id into v_immo_id
    from public.wallets
   where user_id = p_user_id and kind = 'immo' and currency = p_currency
   for update;
  select id into v_seller_id
    from public.wallets
   where user_id = p_user_id and kind = 'seller' and currency = p_currency
   for update;

  -- Meme lecture que request_withdrawal (dernier balance_after) : si la
  -- repartition lisait autrement, l'appel interieur pourrait refuser un
  -- montant que la repartition a juge couvert.
  if v_immo_id is not null then
    v_immo := greatest(coalesce(
      (select balance_after from public.ledger_entries
        where wallet_id = v_immo_id
        order by created_at desc, id desc limit 1), 0), 0);
  end if;
  if v_seller_id is not null then
    v_seller := greatest(coalesce(
      (select balance_after from public.ledger_entries
        where wallet_id = v_seller_id
        order by created_at desc, id desc limit 1), 0), 0);
  end if;

  if p_amount_minor > v_seller + v_immo then
    raise exception 'insufficient_funds'
      using errcode = '22023',
            detail = format('seller %s + immo %s < amount %s', v_seller, v_immo, p_amount_minor);
  end if;

  v_from_seller := least(p_amount_minor, v_seller);
  v_from_immo   := p_amount_minor - v_from_seller;

  -- Chaque part passe par request_withdrawal INCHANGEE : validation de la
  -- destination, verrou, revérification du solde, retenue, statut approved.
  if v_from_seller > 0 then
    return query
      select * from public.request_withdrawal(p_user_id, p_currency, v_from_seller, p_destination, 'seller');
  end if;
  if v_from_immo > 0 then
    return query
      select * from public.request_withdrawal(p_user_id, p_currency, v_from_immo, p_destination, 'immo');
  end if;
end
$fn$;

comment on function public.request_withdrawal_total(uuid, text, bigint, text) is
  'Retrait sur le TOTAL des deux caisses : la caisse Vendeur d''abord, l''Immo '
  'complete. Une demande par caisse, dans la meme transaction, via '
  'request_withdrawal inchangee. Verrouille les deux portefeuilles (immo puis '
  'seller) avant de lire les soldes.';

-- Droits — Supabase re-accorde EXECUTE par defaut (durcissement 2026-07-29)
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'request_withdrawal_total'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$grants$;

-- Contrôle
do $check$
declare v_src text; v_g text; v_miss text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'request_withdrawal_total';
  if v_src is null then raise exception 'request_withdrawal_total absente'; end if;
  if position(chr(65533) in v_src) > 0 then raise exception 'CARACTERE CASSE'; end if;
  v_miss := null;
  foreach v_g in array array[
    'for update', 'insufficient_funds', 'invalid_amount', 'invalid_currency',
    'public.request_withdrawal(p_user_id, p_currency, v_from_seller, p_destination, ''seller'')',
    'public.request_withdrawal(p_user_id, p_currency, v_from_immo, p_destination, ''immo'')'
  ] loop
    if position(v_g in v_src) = 0 then v_miss := coalesce(v_miss || ', ', '') || v_g; end if;
  end loop;
  if v_miss is not null then raise exception 'request_withdrawal_total : %', v_miss; end if;
  if has_function_privilege('authenticated',
       'public.request_withdrawal_total(uuid,text,bigint,text)'::regprocedure, 'execute') then
    raise exception 'request_withdrawal_total executable par authenticated';
  end if;
  raise notice 'retrait sur les deux caisses en place';
end
$check$;

notify pgrst, 'reload schema';

commit;
