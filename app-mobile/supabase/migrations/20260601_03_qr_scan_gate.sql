-- Phase QR Gate — scan_token verrou pour confirm_order_receipt.
--
-- Directive client (1 juin 2026): le bouton hold-to-confirm ne doit JAMAIS être
-- accessible sans scan QR préalable. Avant cette migration, n'importe quel
-- acheteur authentifié pouvait ouvrir /order/<id>/confirm via deep-link ou via
-- la nav interne et libérer l'escrow — le QR n'était qu'un raccourci, pas un
-- verrou. Cette migration ajoute un secret par commande (scan_token) imprimé
-- DANS le QR. La RPC confirm_order_receipt exige maintenant ce token : pas de
-- scan → pas de token → pas de libération.
--
-- Sémantique :
--   - scan_token est généré au moment de la création de la commande (via le
--     DEFAULT — place_order n'a rien à faire de plus, son INSERT n'a jamais
--     listé cette colonne)
--   - Imprimé inside le QR du vendeur en query param : ?token=<scan_token>
--   - Le buyer scanne → l'app lit le token de l'URL → le passe à confirm-receipt
--   - La RPC compare orders.scan_token avec le token reçu, raise INVALID_SCAN_TOKEN
--     sinon
--
-- Backfill : le DEFAULT public.uuidv7() s'applique automatiquement aux lignes
-- existantes lors de l'ALTER TABLE. Les commandes pré-existantes reçoivent
-- toutes un scan_token unique. Les QR générés AVANT cette migration deviennent
-- obsolètes (pas de query param) → l'app scanner les rejette avec un message
-- dédié (Étape 5).

-- =====================================================================
-- 1. Nouveau column scan_token sur orders
-- =====================================================================

alter table public.orders
  add column if not exists scan_token uuid not null default public.uuidv7();

-- =====================================================================
-- 2. DROP de l'ancienne signature 2-args (pour éviter l'ambiguïté avec
--    la nouvelle signature 3-args ci-dessous — sinon postgres garde les
--    deux et confirm-receipt edge fn ne sait plus laquelle appeler)
-- =====================================================================

drop function if exists public.confirm_order_receipt(uuid, uuid);

-- =====================================================================
-- 3. Nouvelle signature 3-args avec gate scan_token
-- =====================================================================
--
-- Ordre des gates :
--   1. ORDER_NOT_FOUND        — order id valide
--   2. ORDER_NOT_BUYER        — caller est bien l'acheteur (déjà existant)
--   3. INVALID_STATUS         — paid|delivered (déjà existant)
--   4. INVALID_SCAN_TOKEN     — NOUVEAU, token matche orders.scan_token
--   5. Wallets + transferts + status flip (inchangé)

create or replace function public.confirm_order_receipt(
  p_order_id    uuid,
  p_caller_id   uuid,
  p_scan_token  uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order               record;
  v_seller_wallet_id    uuid;
  v_escrow_wallet_id    uuid;
  v_platform_wallet_id  uuid;
  v_now                 timestamptz := now();
begin
  select id, buyer_id, seller_id, amount_minor, fees_minor, status, events, scan_token
    into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.buyer_id <> p_caller_id then
    raise exception 'ORDER_NOT_BUYER';
  end if;

  if v_order.status not in ('paid', 'delivered') then
    raise exception 'INVALID_STATUS';
  end if;

  -- Nouveau verrou : sans le bon scan_token, pas de libération.
  -- Place après buyer + status checks pour ne pas leak la validité du token
  -- à des callers non-autorisés ; place avant les wallet lookups pour ne pas
  -- créer de wallet seller au passage si la confirmation va échouer de toute
  -- façon.
  if v_order.scan_token <> p_scan_token then
    raise exception 'INVALID_SCAN_TOKEN';
  end if;

  insert into public.wallets (user_id, currency)
    values (v_order.seller_id, 'GNF')
    on conflict (user_id, currency) do nothing;

  select id into v_seller_wallet_id
    from public.wallets
    where user_id = v_order.seller_id and currency = 'GNF';

  select id into v_escrow_wallet_id
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

  select id into v_platform_wallet_id
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';

  perform public.post_transfer(
    v_escrow_wallet_id, v_seller_wallet_id, v_order.amount_minor,
    'order_release', v_order.id
  );
  perform public.post_transfer(
    v_escrow_wallet_id, v_platform_wallet_id, v_order.fees_minor,
    'order_platform_fee', v_order.id
  );

  update public.orders
    set status = 'released',
        events = v_order.events || jsonb_build_array(
                   jsonb_build_object('at', v_now, 'label', 'Réception confirmée')
                 ),
        updated_at = v_now
    where id = v_order.id;
end;
$$;

revoke all on function public.confirm_order_receipt(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_order_receipt(uuid, uuid, uuid)
  to service_role;
