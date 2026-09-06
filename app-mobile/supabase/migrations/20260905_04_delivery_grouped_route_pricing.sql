-- Livraison groupee : facturer le trajet reel quand les boutiques sont sur le
-- meme chemin (demande client, message du 2026-09-05) :
--
--   « On va optimiser la livraison si c'est plusieurs commandes, les frais de
--     livraison sont additionnes. Si les trajets sont sur le meme chemin, c'est
--     a dire, le livreur recupere une 1ere commande chez le vendeur A et en
--     suite recupere la seconde commande sur le meme chemin chez le vendeur B
--     et livre chez le client C : l'appli fait payer le km entre le point
--     A -> B + B -> C. Si les chemins sont completement opposes : l'appli
--     additionne les frais de livraison. »
--
-- CE QUE FAISAIT LE CODE JUSQU'ICI : chaque boutique payait sa propre distance
-- boutique -> client (A->C + B->C), toujours additionnee. C'est exactement le
-- cas « chemins opposes » du client, applique meme quand les boutiques sont
-- alignees.
--
-- LA REGLE, EN UNE LIGNE : on facture le MOINS CHER des deux trajets.
--   somme  = A->C + B->C            (ce qu'on facturait toujours)
--   chaine = A->B + B->C            (le trajet reel du livreur)
-- Boutiques alignees  -> chaine < somme -> on facture la chaine  (cas 1 client)
-- Boutiques opposees  -> chaine > somme -> on facture la somme   (cas 2 client)
-- Un min() reproduit donc les deux cas decrits, sans avoir a definir un seuil
-- arbitraire de « meme chemin », et ne peut JAMAIS facturer plus qu'avant.
--
-- ORDRE DE RAMASSAGE : la boutique la plus loin du client d'abord, puis on se
-- rapproche. C'est l'ordre que decrit le client (« recupere chez A, puis chez B
-- sur le meme chemin, puis livre chez C ») et il donne une vraie longueur de
-- trajet. Il n'est pas garanti optimal au-dela de 2 boutiques — sans importance
-- ici : comme on prend le min avec la somme, une chaine sous-optimale ne fait
-- que retomber sur l'ancien prix. Jamais plus cher, jamais invente.
--
-- GARDE-FOU INCHANGE : si UNE seule boutique (ou l'adresse) n'a pas de vrai pin
-- de carte, delivery_chain_km rend NULL et l'appelant retombe sur le calcul
-- par boutique existant. On ne facture pas une geometrie fictive.

-- ─── 1. Longueur du trajet groupe (NULL si un point n'est pas fiable) ───────
create or replace function public.delivery_chain_km(
  p_shop_ids uuid[], p_address_id uuid
) returns double precision
language sql
stable
set search_path = ''
as $$
  with addr as (
    select a.lat, a.lng
    from public.addresses a
    where a.id = p_address_id
      and public.geo_is_pinned(a.lat, a.lng, a.city, a.district)
  ),
  pts as (
    select s.id, s.lat, s.lng,
           public.haversine_km(s.lat, s.lng, addr.lat, addr.lng) as km_to_client
    from public.shops s, addr
    where s.id = any(p_shop_ids)
      and public.geo_is_pinned(s.lat, s.lng, s.city, null)
  ),
  ordered as (
    -- La plus eloignee du client en premier : on ramasse en se rapprochant.
    select p.*, row_number() over (order by p.km_to_client desc, p.id) as rn
    from pts p
  ),
  legs as (
    select o.rn, o.lat, o.lng,
           lag(o.lat) over (order by o.rn) as prev_lat,
           lag(o.lng) over (order by o.rn) as prev_lng
    from ordered o
  )
  select case
    -- Toutes les boutiques demandees doivent etre pinnees, et l'adresse aussi,
    -- sinon on ne sait pas : NULL, l'appelant retombe sur l'existant.
    when (select count(*) from pts) is distinct from
         (select count(distinct x) from unnest(p_shop_ids) as x) then null
    when not exists (select 1 from addr) then null
    else
      -- somme des sauts entre ramassages consecutifs...
      coalesce((
        select sum(public.haversine_km(l.prev_lat, l.prev_lng, l.lat, l.lng))
        from legs l
        where l.prev_lat is not null
      ), 0)
      -- ...plus le dernier saut, de la derniere boutique vers le client.
      + coalesce((
        select o.km_to_client from ordered o
        where o.rn = (select max(rn) from ordered)
      ), 0)
  end;
$$;

-- ─── 2. Prix groupe pour un panier : min(somme par boutique, trajet chaine) ──
-- Renvoie NULL si le trajet groupe n'est pas calculable de facon fiable, ou
-- s'il n'y a qu'une seule boutique (rien a grouper : le calcul par boutique
-- existant est deja exactement le bon prix).
create or replace function public.delivery_group_fee_minor(
  p_shop_ids uuid[], p_address_id uuid
) returns bigint
language sql
stable
set search_path = ''
as $$
  with distinct_shops as (
    select distinct x as shop_id from unnest(p_shop_ids) as x
  ),
  per_shop as (
    select public.delivery_fee_for_shop(d.shop_id, p_address_id) as fee
    from distinct_shops d
  ),
  chain as (
    select public.delivery_chain_km(p_shop_ids, p_address_id) as km
  )
  select case
    when (select count(*) from distinct_shops) < 2 then null
    -- une seule boutique non fiable suffit a invalider le groupe
    when exists (select 1 from per_shop where fee is null) then null
    when (select km from chain) is null then null
    else least(
      (select sum(fee) from per_shop),
      public.delivery_fee_linear((select km from chain))
    )
  end;
$$;

revoke all on function public.delivery_chain_km(uuid[], uuid) from public, anon, authenticated;
revoke all on function public.delivery_group_fee_minor(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.delivery_chain_km(uuid[], uuid) to service_role;
grant execute on function public.delivery_group_fee_minor(uuid[], uuid) to service_role;

-- ─── 3. delivery_quote : exposer aussi le prix groupe ───────────────────────
-- L'ecran de paiement doit montrer EXACTEMENT ce qui sera preleve. On garde la
-- ligne par boutique (l'acheteur voit le detail) et on ajoute une colonne
-- constante group_total_minor : quand elle n'est pas NULL, c'est ELLE le total
-- a afficher et a prelever, pas la somme des lignes.
-- DROP explicite : changer la forme du RETURNS TABLE d'une fonction existante
-- exige de la supprimer d'abord (meme regle qu'en 2026-08-31 sur
-- pick_stale_stripe_intents).
drop function if exists public.delivery_quote(uuid[], uuid, bigint);

create or replace function public.delivery_quote(
  p_shop_ids uuid[], p_address_id uuid, p_fallback_minor bigint
) returns table (
  shop_id uuid,
  fee_minor bigint,
  distance_km double precision,
  priced_by_distance boolean,
  group_total_minor bigint
)
language sql
stable
set search_path = ''
as $$
  select
    s                                                            as shop_id,
    coalesce(public.delivery_fee_for_shop(s, p_address_id), p_fallback_minor) as fee_minor,
    public.delivery_distance_km(s, p_address_id)                 as distance_km,
    public.delivery_fee_for_shop(s, p_address_id) is not null    as priced_by_distance,
    public.delivery_group_fee_minor(p_shop_ids, p_address_id)    as group_total_minor
  from unnest(p_shop_ids) as s;
$$;

revoke all on function public.delivery_quote(uuid[], uuid, bigint) from public, anon, authenticated;
grant execute on function public.delivery_quote(uuid[], uuid, bigint) to service_role;

-- ─── 4. place_orders_batch : appliquer le prix groupe ───────────────────────
-- Corps repris caractere pour caractere de 20260903_01 ; seuls le bloc declare,
-- le calcul du prix groupe (une fois, apres la garde TOO_MANY_SHOPS) et la
-- ligne du tarif de livraison changent. Signature inchangee, donc pas de DROP.
create or replace function public.place_orders_batch(
  p_buyer_id           uuid,
  p_items              jsonb,   -- [{"product_id":"<uuid>","quantity":2}, ...]
  p_payment_method     text,
  p_delivery_mode      text default 'delivery',
  p_delivery_fee_minor bigint default 0,  -- repli forfaitaire PAR BOUTIQUE
  p_address_id         uuid default null  -- destination : active le prix a la distance
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
  v_group_total      bigint;          -- prix groupe du panier (NULL = non applicable)
  v_indiv_sum        bigint;          -- somme des prix par boutique (base du prorata)
  v_indiv_fee        bigint;
  v_allocated        bigint := 0;     -- deja reparti sur les commandes precedentes
  v_shop_idx         integer := 0;
  v_shop_count       integer;
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

  -- ── Livraison groupee (client 2026-09-05) ────────────────────────────────
  -- Quand le panier couvre plusieurs boutiques, on facture le MOINS CHER entre
  -- la somme boutique-par-boutique (chemins opposes) et le trajet reel enchaine
  -- A -> B -> client (meme chemin). delivery_group_fee_minor rend NULL des
  -- qu'un seul point n'est pas un vrai pin : on retombe alors exactement sur le
  -- comportement d'avant, boutique par boutique.
  v_shop_count := coalesce(array_length(v_shops, 1), 0);
  v_group_total := null;
  if p_delivery_mode = 'delivery' and p_address_id is not null and v_shop_count > 1 then
    v_group_total := public.delivery_group_fee_minor(v_shops, p_address_id);
    if v_group_total is not null then
      select sum(public.delivery_fee_for_shop(x, p_address_id))
        into v_indiv_sum
        from unnest(v_shops) as x;
      -- Base du prorata inutilisable : on renonce au groupage plutot que de
      -- diviser par zero.
      if v_indiv_sum is null or v_indiv_sum <= 0 then
        v_group_total := null;
      end if;
    end if;
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
    -- CHANGEMENT 2026-09-03 : prix a la DISTANCE quand elle est fiable.
    -- delivery_fee_for_shop rend NULL des que l'un des deux points n'est pas
    -- un vrai pin (coordonnees encore egales au centroide de la ville) : on
    -- retombe alors sur le forfait, plutot que de facturer une geometrie
    -- fictive. La propriete de 2026-08-22 tient toujours — chaque montant
    -- reste un entier, donc la somme des totaux retombe exactement sur le
    -- montant paye, egalite que process_batch_intent_outcome verifie avant
    -- d'alimenter le sequestre.
    -- CHANGEMENT 2026-09-05 : quand le panier est groupe (v_group_total non
    -- NULL), le prix du trajet enchaine est reparti au prorata de la distance
    -- de chaque boutique. La DERNIERE commande recoit le reste exact, pour que
    -- la somme des livraisons retombe pile sur v_group_total — c'est l'egalite
    -- somme(total_minor) = montant paye que process_batch_intent_outcome
    -- verifie avant d'alimenter le sequestre.
    v_shop_idx := v_shop_idx + 1;
    if p_delivery_mode = 'delivery' and p_address_id is not null then
      if v_group_total is not null then
        if v_shop_idx = v_shop_count then
          v_shop_delivery := v_group_total - v_allocated;
        else
          v_indiv_fee := public.delivery_fee_for_shop(v_shop, p_address_id);
          v_shop_delivery := floor(v_group_total::numeric * v_indiv_fee / v_indiv_sum)::bigint;
          v_allocated := v_allocated + v_shop_delivery;
        end if;
      else
        v_shop_delivery := coalesce(
          public.delivery_fee_for_shop(v_shop, p_address_id),
          v_delivery_fee);
      end if;
    else
      v_shop_delivery := v_delivery_fee;
    end if;

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

revoke all on function public.place_orders_batch(uuid, jsonb, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.place_orders_batch(uuid, jsonb, text, text, bigint, uuid) to service_role;
