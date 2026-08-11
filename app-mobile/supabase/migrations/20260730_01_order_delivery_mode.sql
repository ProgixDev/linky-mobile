-- 20260730_01_order_delivery_mode.sql
-- Client (Abdoulaye BAH, 2026-07-30) : « il faut donner la possibilité aux
-- clients de choisir soit la livraison ou le retrait sur place. Dans notre cas
-- la livraison sera assurée par Linky avec des frais de livraison applicables. »
--
-- Ajoute un mode de réception aux commandes produit :
--   'pickup'   — le client retire à la boutique. AUCUN frais, AUCUNE livraison.
--   'delivery' — Linky livre. Frais de livraison forfaitaire ajouté au total,
--                séquestré avec la commande, versé au wallet PLATEFORME à la
--                confirmation (Linky opère la livraison), + une ligne deliveries
--                est créée pour le dispatch.
--
-- Modèle monétaire (GNF = zéro décimale, minor == major) :
--   total = articles + frais de service (3%) + frais de livraison
--   à la libération : vendeur <- articles ; plateforme <- service + livraison ;
--   le séquestre revient exactement à zéro.

begin;

-- 1) Colonnes. delivery_mode défaut 'delivery' pour que toutes les commandes
--    existantes restent sémantiquement inchangées (elles étaient toutes en
--    livraison) ; delivery_fee_minor défaut 0 garde les totaux historiques
--    cohérents.
alter table public.orders
  add column if not exists delivery_mode text not null default 'delivery'
    check (delivery_mode in ('pickup', 'delivery')),
  add column if not exists delivery_fee_minor bigint not null default 0
    check (delivery_fee_minor >= 0);

-- 2) place_order — l'ancienne signature 4-args DOIT être supprimée : ajouter des
--    params avec DEFAULT créerait un overload ambigu pour l'appel PostgREST à 4
--    arguments nommés. Recréée avec les params livraison. RE-REVOKE ensuite : un
--    CREATE frais re-accorde EXECUTE à public par défaut (durcissement
--    2026-07-29 — les fns ne sont jamais appelées directement par le client).
drop function if exists public.place_order(uuid, uuid, integer, text);

create function public.place_order(
  p_buyer_id           uuid,
  p_product_id         uuid,
  p_quantity           integer,
  p_payment_method     text,
  p_delivery_mode      text   default 'delivery',
  p_delivery_fee_minor bigint default 0
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_product           record;
  v_seller_id         uuid;
  v_amount_minor      bigint;
  v_fees_minor        bigint;
  v_delivery_fee      bigint;
  v_total_minor       bigint;
  v_order_id          uuid;
  v_reference         text;
  v_now               timestamptz := now();
  v_buyer_wallet_id   uuid;
  v_escrow_wallet_id  uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  if p_delivery_mode is null or p_delivery_mode not in ('pickup', 'delivery') then
    raise exception 'INVALID_DELIVERY_MODE';
  end if;

  -- Le serveur est autoritaire sur le frais : un retrait est toujours gratuit,
  -- un frais négatif est refusé. L'edge fn passe le forfait pour 'delivery'.
  if p_delivery_mode = 'pickup' then
    v_delivery_fee := 0;
  else
    v_delivery_fee := coalesce(p_delivery_fee_minor, 0);
    if v_delivery_fee < 0 then raise exception 'INVALID_DELIVERY_FEE'; end if;
  end if;

  select p.id, p.shop_id, p.title, p.photos, p.price_minor, p.status, s.owner_id
    into v_product
    from public.products p
    join public.shops s on s.id = p.shop_id
    where p.id = p_product_id
    for update of p;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_product.status <> 'active' then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

  v_seller_id := v_product.owner_id;
  if v_seller_id = p_buyer_id then raise exception 'BUYER_IS_SELLER'; end if;

  v_amount_minor := v_product.price_minor * p_quantity;
  v_fees_minor   := round(v_amount_minor * 0.03);
  v_total_minor  := v_amount_minor + v_fees_minor + v_delivery_fee;
  v_reference    := public.generate_order_reference();

  if p_payment_method = 'wallet' then
    -- WALLET BRANCH : transfert atomique buyer -> escrow du total (frais de
    -- livraison inclus).
    insert into public.wallets (user_id, currency)
      values (p_buyer_id, 'GNF')
      on conflict (user_id, currency) do nothing;

    select id into v_buyer_wallet_id
      from public.wallets
      where user_id = p_buyer_id and currency = 'GNF';

    select id into v_escrow_wallet_id
      from public.wallets
      where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

    insert into public.orders (
      reference, buyer_id, seller_id, shop_id, product_id,
      product_snapshot, quantity, amount_minor, fees_minor, total_minor,
      delivery_mode, delivery_fee_minor,
      payment_method, status, events
    ) values (
      v_reference, p_buyer_id, v_seller_id, v_product.shop_id, v_product.id,
      jsonb_build_object('title', v_product.title, 'photo', coalesce(v_product.photos[1], ''), 'priceGnf', v_product.price_minor),
      p_quantity, v_amount_minor, v_fees_minor, v_total_minor,
      p_delivery_mode, v_delivery_fee,
      p_payment_method,
      'paid',
      jsonb_build_array(
        jsonb_build_object('at', v_now, 'label', 'Commande passée'),
        jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')
      )
    )
    returning id into v_order_id;

    perform public.post_transfer(
      v_buyer_wallet_id, v_escrow_wallet_id, v_total_minor,
      'order_escrow', v_order_id
    );
  else
    -- RAIL BRANCH : insertion à 'placed', aucun mouvement de fonds. Les intents
    -- Lengopay passent à 'paid' via cron-poll-intents (process_intent_outcome
    -- crédite l'escrow avec total_minor, frais de livraison inclus) ; les intents
    -- stripe via stripe-webhook.
    insert into public.orders (
      reference, buyer_id, seller_id, shop_id, product_id,
      product_snapshot, quantity, amount_minor, fees_minor, total_minor,
      delivery_mode, delivery_fee_minor,
      payment_method, status, events
    ) values (
      v_reference, p_buyer_id, v_seller_id, v_product.shop_id, v_product.id,
      jsonb_build_object('title', v_product.title, 'photo', coalesce(v_product.photos[1], ''), 'priceGnf', v_product.price_minor),
      p_quantity, v_amount_minor, v_fees_minor, v_total_minor,
      p_delivery_mode, v_delivery_fee,
      p_payment_method,
      'placed',
      jsonb_build_array(jsonb_build_object('at', v_now, 'label', 'Commande passée'))
    )
    returning id into v_order_id;
  end if;

  return v_order_id;
end;
$function$;

revoke execute on function public.place_order(uuid, uuid, integer, text, text, bigint) from public, anon, authenticated;

-- 3) confirm_order_receipt — libère le frais de livraison vers le wallet
--    PLATEFORME en même temps que le frais de service (3%), pour que le séquestre
--    revienne à zéro (il a reçu articles+service+livraison). Signature inchangée
--    -> CREATE OR REPLACE conserve le revoke existant.
create or replace function public.confirm_order_receipt(p_order_id uuid, p_caller_id uuid, p_scan_token uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_order               record;
  v_seller_wallet_id    uuid;
  v_escrow_wallet_id    uuid;
  v_platform_wallet_id  uuid;
  v_now                 timestamptz := now();
begin
  select id, buyer_id, seller_id, amount_minor, fees_minor, delivery_fee_minor, status, events, scan_token
    into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.buyer_id <> p_caller_id then
    raise exception 'ORDER_NOT_BUYER';
  end if;

  -- Widened gate (X.9) : 'preparing' = seller marked the package shipped.
  if v_order.status not in ('paid', 'preparing', 'delivered') then
    raise exception 'INVALID_STATUS';
  end if;

  -- QR verrou (20260601_03) : sans le bon scan_token, pas de libération.
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

  -- Le vendeur reçoit le montant articles ; la plateforme reçoit le frais de
  -- service + le frais de livraison (Linky opère la livraison). Les deux sont
  -- tirés du séquestre -> le séquestre revient à zéro.
  perform public.post_transfer(
    v_escrow_wallet_id, v_seller_wallet_id, v_order.amount_minor,
    'order_release', v_order.id
  );
  perform public.post_transfer(
    v_escrow_wallet_id, v_platform_wallet_id,
    v_order.fees_minor + coalesce(v_order.delivery_fee_minor, 0),
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
$function$;

-- 4) create_delivery_for_new_order — n'insère AUCUNE livraison pour un retrait
--    sur place (rien à dispatcher). Signature inchangée -> CREATE OR REPLACE.
create or replace function public.create_delivery_for_new_order()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_addr record;
begin
  -- Retrait sur place : le client vient chercher à la boutique, pas de livraison.
  if new.delivery_mode = 'pickup' then
    return new;
  end if;

  -- Snapshot the buyer's default address (if any) at order creation time.
  -- Address changes after this point do NOT redirect the package — escrow
  -- depends on a deterministic delivery destination.
  select id, label, city, district, details
    into v_addr
    from public.addresses
    where user_id = new.buyer_id and is_default = true
    limit 1;

  insert into public.deliveries (order_id, delivery_address, status)
  values (
    new.id,
    case when v_addr.id is null then null else
      jsonb_build_object(
        'address_id', v_addr.id,
        'label',      v_addr.label,
        'city',       v_addr.city,
        'district',   v_addr.district,
        'details',    v_addr.details
      )
    end,
    'unassigned'
  )
  on conflict (order_id) do nothing;
  return new;
end;
$function$;

commit;
