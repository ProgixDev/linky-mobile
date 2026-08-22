-- ============================================================================
-- Livraison facturee PAR BOUTIQUE, et non plus une seule fois par panier.
-- Client 2026-08-22 : « la somme totale des produits + la somme des livraisons ».
--
-- Deux boutiques = deux colis, deux livreurs, deux trajets. Le panier du
-- 2026-08-21 ne facturait le forfait qu'une fois, portee entierement par la
-- premiere commande : Linky absorbait le second trajet, et la commande n°2
-- partait avec delivery_fee_minor = 0, ce qui aurait fausse toute
-- reconciliation avec le livreur.
--
-- L'acheteur, lui, ne voit qu'UN chiffre — la somme — comme demande.
--
-- Le forfait passe par ailleurs de 15 000 a 5 000 GNF (constante applicative,
-- _shared/delivery.ts + src/lib/delivery.ts). Une tarification a la DISTANCE
-- est attendue d'Abdoulaye ; ce sera une autre migration.
--
-- CE QUI NE CHANGE PAS : le montant reste decide par le SERVEUR. p_delivery_fee
-- vient de la constante partagee, jamais du corps de la requete.
--
-- Applique en prod (mkaddhcjneilvwqethjo) via l'editeur SQL.
-- ============================================================================

-- Seule la passe 2 change : v_shop_delivery vaut le forfait pour CHAQUE
-- boutique. v_first_shop disparait. Le reste du corps est identique a
-- 20260821_01 — il est reproduit en entier parce que CREATE OR REPLACE
-- remplace la fonction complete.
create or replace function public.place_orders_batch(
  p_buyer_id           uuid,
  p_items              jsonb,   -- [{"product_id":"<uuid>","quantity":2}, ...]
  p_payment_method     text,
  p_delivery_mode      text default 'delivery',
  p_delivery_fee_minor bigint default 0   -- forfait PAR BOUTIQUE desormais
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item             jsonb;
  v_product          record;
  v_qty              integer;
  v_line_amount      bigint;
  v_delivery_fee     bigint;
  v_batch_id         uuid := public.uuidv7();
  v_now              timestamptz := now();
  v_seen             uuid[] := '{}';
  v_shops            uuid[] := '{}';
  v_lines            jsonb := '[]'::jsonb;
  v_shop             uuid;
  v_shop_amount      bigint;
  v_shop_fees        bigint;
  v_shop_total       bigint;
  v_shop_delivery    bigint;
  v_order_id         uuid;
  v_seller_id        uuid;
  v_primary          jsonb;
  v_buyer_wallet_id  uuid;
  v_escrow_wallet_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_ITEMS';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'TOO_MANY_ITEMS';
  end if;
  if p_delivery_mode is null or p_delivery_mode not in ('pickup', 'delivery') then
    raise exception 'INVALID_DELIVERY_MODE';
  end if;
  if p_payment_method is null then raise exception 'INVALID_PAYMENT_METHOD'; end if;

  if p_delivery_mode = 'pickup' then
    v_delivery_fee := 0;
  else
    v_delivery_fee := coalesce(p_delivery_fee_minor, 0);
    if v_delivery_fee < 0 then raise exception 'INVALID_DELIVERY_FEE'; end if;
  end if;

  -- ── Passe 1 : verrouiller, valider, decrementer le stock, collecter ──────
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 0);
    if v_qty <= 0 or v_qty > 100 then raise exception 'INVALID_QUANTITY'; end if;

    select p.id, p.shop_id, p.title, p.photos, p.price_minor, p.status, p.stock, s.owner_id
      into v_product
      from public.products p
      join public.shops s on s.id = p.shop_id
      where p.id = (v_item ->> 'product_id')::uuid
      for update of p;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if v_product.status <> 'active' then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

    if v_product.id = any(v_seen) then raise exception 'DUPLICATE_ITEM'; end if;
    v_seen := v_seen || v_product.id;

    if v_product.owner_id = p_buyer_id then raise exception 'BUYER_IS_SELLER'; end if;

    if v_product.stock is not null then
      if v_product.stock <= 0 then raise exception 'OUT_OF_STOCK'; end if;
      if v_qty > v_product.stock then raise exception 'INSUFFICIENT_STOCK'; end if;
      update public.products set stock = stock - v_qty where id = v_product.id;
    end if;

    if not (v_product.shop_id = any(v_shops)) then
      v_shops := v_shops || v_product.shop_id;
    end if;

    v_line_amount := v_product.price_minor * v_qty;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',       v_product.id,
      'shop_id',          v_product.shop_id,
      'owner_id',         v_product.owner_id,
      'quantity',         v_qty,
      'unit_price_minor', v_product.price_minor,
      'amount_minor',     v_line_amount,
      'snapshot', jsonb_build_object(
        'title',    v_product.title,
        'photo',    coalesce(v_product.photos[1], ''),
        'priceGnf', v_product.price_minor
      )
    ));
  end loop;

  if array_length(v_shops, 1) > 10 then
    raise exception 'TOO_MANY_SHOPS';
  end if;

  -- ── Passe 2 : une commande par boutique, chacune avec SA livraison ───────
  foreach v_shop in array v_shops
  loop
    select sum((l ->> 'amount_minor')::bigint)
      into v_shop_amount
      from jsonb_array_elements(v_lines) as l
      where (l ->> 'shop_id')::uuid = v_shop;

    select (l ->> 'owner_id')::uuid, l
      into v_seller_id, v_primary
      from jsonb_array_elements(v_lines) as l
      where (l ->> 'shop_id')::uuid = v_shop
      limit 1;

    v_shop_fees := round(v_shop_amount * 0.03);

    -- CHANGEMENT 2026-08-22 : chaque boutique porte son propre forfait. Chaque
    -- commande est ainsi autonome — son total couvre reellement son colis, ce
    -- qui rend la reconciliation avec le livreur possible. Aucun arrondi n'est
    -- introduit (le forfait est un entier repete), donc la somme des totaux
    -- retombe toujours exactement sur le montant paye : c'est cette egalite que
    -- verifie process_batch_intent_outcome avant d'alimenter le sequestre.
    v_shop_delivery := v_delivery_fee;

    v_shop_total := v_shop_amount + v_shop_fees + v_shop_delivery;

    insert into public.orders (
      reference, buyer_id, seller_id, shop_id, product_id,
      product_snapshot, quantity, amount_minor, fees_minor, total_minor,
      delivery_mode, delivery_fee_minor,
      payment_method, status, events, batch_id
    ) values (
      public.generate_order_reference(), p_buyer_id, v_seller_id, v_shop,
      (v_primary ->> 'product_id')::uuid,
      v_primary -> 'snapshot',
      (v_primary ->> 'quantity')::int,
      v_shop_amount, v_shop_fees, v_shop_total,
      p_delivery_mode, v_shop_delivery,
      p_payment_method,
      case when p_payment_method = 'wallet' then 'paid' else 'placed' end,
      case when p_payment_method = 'wallet' then
        jsonb_build_array(
          jsonb_build_object('at', v_now, 'label', 'Commande passée'),
          jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')
        )
      else
        jsonb_build_array(jsonb_build_object('at', v_now, 'label', 'Commande passée'))
      end,
      v_batch_id
    )
    returning id into v_order_id;

    insert into public.order_items (order_id, product_id, product_snapshot, quantity, unit_price_minor, amount_minor)
    select
      v_order_id,
      (l ->> 'product_id')::uuid,
      l -> 'snapshot',
      (l ->> 'quantity')::int,
      (l ->> 'unit_price_minor')::bigint,
      (l ->> 'amount_minor')::bigint
    from jsonb_array_elements(v_lines) as l
    where (l ->> 'shop_id')::uuid = v_shop;

    if p_payment_method = 'wallet' then
      insert into public.wallets (user_id, currency)
        values (p_buyer_id, 'GNF')
        on conflict (user_id, currency) do nothing;

      select id into v_buyer_wallet_id
        from public.wallets where user_id = p_buyer_id and currency = 'GNF';
      select id into v_escrow_wallet_id
        from public.wallets
        where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';
      if v_buyer_wallet_id is null then raise exception 'BUYER_WALLET_NOT_FOUND'; end if;
      if v_escrow_wallet_id is null then raise exception 'ESCROW_WALLET_NOT_FOUND'; end if;

      perform public.post_transfer(
        v_buyer_wallet_id, v_escrow_wallet_id, v_shop_total,
        'order_escrow', v_order_id
      );
    end if;
  end loop;

  return v_batch_id;
end;
$$;

-- Supabase re-accorde EXECUTE a anon/authenticated a chaque CREATE OR REPLACE
-- d'une fonction SECURITY DEFINER : le retrait doit etre rejoue.
revoke all on function public.place_orders_batch(uuid, jsonb, text, text, bigint) from public, anon, authenticated;
grant execute on function public.place_orders_batch(uuid, jsonb, text, text, bigint) to service_role;
