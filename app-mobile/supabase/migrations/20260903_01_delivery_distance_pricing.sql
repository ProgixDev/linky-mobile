-- ============================================================================
-- Livraison a la DISTANCE — branchement de la grille enfin fournie.
--
-- Client 2026-09-03 : « Pour la configuration de la Livraison, il faut mettre
-- 1 km = 2000 GNF. L'appli calcule la distance Vendeur A -> client C et ajuste
-- le prix de la livraison. »
--
-- L'infrastructure existait deja (20260824_01) : haversine_km,
-- delivery_distance_km, delivery_tariffs, delivery_fee_for_km — construites
-- puis volontairement laissees DEBRANCHEES en attendant cette grille. Cette
-- migration fournit la grille et fait le branchement.
--
-- ── LE GARDE-FOU, ET POURQUOI IL EXISTE ────────────────────────────────────
-- Les coordonnees ne sont pas toutes reelles. Le trigger shops_set_geo remplit
-- geo_centroid(city, NULL) — au niveau VILLE — quand le vendeur n'a pas pose
-- de point sur la carte. Toutes les boutiques non epinglees de Conakry sont
-- donc exactement au MEME point (9.5350, -13.6800), et la distance entre deux
-- d'entre elles vaut litteralement 0 km. Facturer 2000 GNF/km sur cette
-- geometrie produirait des montants coherents, auditables, et faux.
--
-- Donc : le prix a la distance ne s'applique QUE si les DEUX extremites ont un
-- vrai point. « Vrai point » se deduit sans nouvelle colonne ni backfill — il
-- suffit de comparer les coordonnees au centroide que le trigger aurait pose.
-- Si elles en different, quelqu'un a bouge le curseur. Sinon, repli sur le
-- forfait d'aujourd'hui : la facturation ne bouge donc PAS pour les comptes
-- existants, et se met a la distance au fur et a mesure que les points sont
-- poses. Un faux negatif (un vendeur ayant epingle pile le centroide) coute
-- le prix d'aujourd'hui — jamais un prix invente.
--
-- ── ORDRE D'APPLICATION — IMPORTANT ───────────────────────────────────────
-- CETTE MIGRATION D'ABORD, LES FONCTIONS EDGE ENSUITE.
-- place-orders-batch envoie p_address_id inconditionnellement ; tant que la
-- nouvelle signature n'existe pas, PostgREST ne trouve aucune surcharge et
-- TOUT panier multi-boutiques echoue en 500. Le chemin mono-boutique et le
-- devis, eux, se degradent proprement (repli forfait).
--
-- A appliquer en prod (mkaddhcjneilvwqethjo) via l'editeur SQL.
-- ============================================================================

-- ─── 1. Parametres de tarification, modifiables sans migration ──────────────
-- Une seule ligne. La table existante delivery_tariffs (par tranches) ne sait
-- pas exprimer une regle LINEAIRE ; ces trois nombres si, et restent reglables
-- depuis l'editeur SQL sans toucher au code ni redeployer.
create table if not exists public.delivery_pricing (
  id                  boolean primary key default true check (id),
  rate_per_km_minor   bigint not null check (rate_per_km_minor >= 0),
  min_fee_minor       bigint not null check (min_fee_minor >= 0),
  max_fee_minor       bigint not null check (max_fee_minor >= 0),
  updated_at          timestamptz not null default now(),
  check (max_fee_minor >= min_fee_minor)
);
alter table public.delivery_pricing enable row level security;
-- Aucune politique publique : la tarification ne se lit que cote serveur.

-- Valeurs seedees = LA REGLE DU CLIENT, A LA LETTRE : « 1 km = 2000 GNF ».
-- min_fee = 2000 est donc neutre (ceil() facture deja un km entame au moins),
-- et NON 5000 : mettre le forfait actuel en plancher aurait silencieusement
-- annule la regle demandee sur toutes les courses de moins de 2,5 km, c'est-a-
-- dire la majorite des trajets urbains. Le client lirait « 1 km = 2000 » et
-- verrait 5000 sur la premiere facture.
--
-- CONSEQUENCES A FAIRE VALIDER (elles decoulent de sa regle, pas d'un choix
-- technique) : une course courte descend sous le prix d'aujourd'hui (2 km =
-- 4000 contre 5000), et une longue le depasse nettement (Kaloum -> Ratoma,
-- ~8 km a vol d'oiseau = 16 000 contre 5000).
--
-- max 50000 = 25 km au tarif plein. C'est le SEUL garde-fou invente ici : il
-- ne change rien en agglomeration et empeche une coordonnee aberrante de
-- facturer une somme absurde.
insert into public.delivery_pricing (id, rate_per_km_minor, min_fee_minor, max_fee_minor)
select true, 2000, 2000, 50000
where not exists (select 1 from public.delivery_pricing);

-- ─── 2. Ce point est-il un VRAI point, ou un centroide par defaut ? ─────────
-- Tolerance 0.0005° (~55 m) : assez large pour absorber les arrondis de
-- stockage, assez fine pour qu'un point reellement pose ailleurs soit distinct.
--
-- DEUX conditions, et la seconde n'est pas du zele.
--
-- (a) le point differe du centroide de SA ville/quartier ;
-- (b) le point ne coincide avec AUCUN centroide connu.
--
-- (b) existe parce que la ville et les coordonnees s'editent separement :
-- shops_set_geo et addresses_set_geo ne remplissent les coordonnees que
-- lorsqu'elles sont NULL, alors que shop-upsert ecrit toujours city et
-- n'envoie lat/lng que si le client les a fournis. Une boutique creee a
-- Conakry sans point pose (donc au centroide de Conakry) puis rebaptisee
-- « Kindia » garde les coordonnees de Conakry : avec (a) seul, l'ecart avec le
-- centroide de Kindia se lisait comme « quelqu'un a bouge le curseur », et on
-- facturait 133 km de distance imaginaire — plafonnes a 50 000 GNF au lieu du
-- forfait de 5 000. Exactement le prix invente que ce garde-fou existe pour
-- empecher. (b) le reconnait pour ce qu'il est : un centroide, donc pas un pin.
--
-- Le cout de (b) est un faux negatif — un vendeur ayant reellement pose son
-- point a moins de 55 m d'un centroide de reference paie le forfait. C'est le
-- bon sens de l'erreur : le prix d'aujourd'hui, jamais un prix invente.
create or replace function public.geo_is_pinned(
  p_lat double precision, p_lng double precision,
  p_city text, p_district text
) returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_lat is null or p_lng is null then false
    else
      exists (
        select 1 from public.geo_centroid(p_city, p_district) c
        where abs(c.lat - p_lat) > 0.0005 or abs(c.lng - p_lng) > 0.0005
      )
      and not exists (
        select 1 from public.geo_centroids g
        where abs(g.lat - p_lat) <= 0.0005 and abs(g.lng - p_lng) <= 0.0005
      )
      -- Repli code en dur de geo_centroid quand la ville est inconnue
      -- (9.5350, -13.6800) : il n'est pas dans la table, il faut l'exclure ici.
      and not (abs(9.5350 - p_lat) <= 0.0005 and abs(-13.6800 - p_lng) <= 0.0005)
  end;
$$;

-- ─── 3. Tarif lineaire pour une distance ────────────────────────────────────
-- ceil() par kilometre entame : c'est la convention de course habituelle, et
-- elle evite qu'un trajet de 900 m soit facture moins qu'un kilometre.
create or replace function public.delivery_fee_linear(p_km double precision)
returns bigint
language sql
stable
set search_path = ''
as $$
  select greatest(
           p.min_fee_minor,
           least(p.max_fee_minor, ceil(greatest(p_km, 0))::bigint * p.rate_per_km_minor)
         )
  from public.delivery_pricing p
  where p.id;
$$;

-- ─── 4. Tarif pour une boutique vers une adresse — ou NULL ──────────────────
-- NULL = « je ne sais pas de façon fiable », et c'est le signal que l'appelant
-- doit retomber sur le forfait. Une seule porte d'entree, un seul endroit ou
-- la regle du garde-fou est ecrite.
create or replace function public.delivery_fee_for_shop(
  p_shop_id uuid, p_address_id uuid
) returns bigint
language sql
stable
set search_path = ''
as $$
  select public.delivery_fee_linear(public.haversine_km(s.lat, s.lng, a.lat, a.lng))
  from public.shops s, public.addresses a
  where s.id = p_shop_id
    and a.id = p_address_id
    and public.geo_is_pinned(s.lat, s.lng, s.city, null)
    and public.geo_is_pinned(a.lat, a.lng, a.city, a.district);
$$;

-- ─── 5. Devis affichable : par boutique, pour un panier ─────────────────────
-- L'ecran de paiement doit montrer EXACTEMENT ce qui sera preleve. Il ne peut
-- pas le calculer lui-meme (delivery_pricing et shops.lat/lng ne sortent pas
-- du serveur), d'ou cette fonction, utilisee par la fonction edge delivery-quote.
-- Renvoie une ligne par boutique, avec le repli deja applique.
create or replace function public.delivery_quote(
  p_shop_ids uuid[], p_address_id uuid, p_fallback_minor bigint
) returns table (shop_id uuid, fee_minor bigint, distance_km double precision, priced_by_distance boolean)
language sql
stable
set search_path = ''
as $$
  select
    s                                                            as shop_id,
    coalesce(public.delivery_fee_for_shop(s, p_address_id), p_fallback_minor) as fee_minor,
    public.delivery_distance_km(s, p_address_id)                 as distance_km,
    public.delivery_fee_for_shop(s, p_address_id) is not null    as priced_by_distance
  from unnest(p_shop_ids) as s;
$$;

revoke all on function public.geo_is_pinned(double precision, double precision, text, text) from public, anon, authenticated;
revoke all on function public.delivery_fee_linear(double precision) from public, anon, authenticated;
revoke all on function public.delivery_fee_for_shop(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delivery_quote(uuid[], uuid, bigint) from public, anon, authenticated;
grant execute on function public.geo_is_pinned(double precision, double precision, text, text) to service_role;
grant execute on function public.delivery_fee_linear(double precision) to service_role;
grant execute on function public.delivery_fee_for_shop(uuid, uuid) to service_role;
grant execute on function public.delivery_quote(uuid[], uuid, bigint) to service_role;

-- ─── 6. place_orders_batch — ajout de p_address_id ──────────────────────────
-- DROP explicite avant CREATE : ajouter un parametre cree une SURCHARGE, pas
-- un remplacement, et deux surcharges rendraient l'appel ambigu — exactement
-- le defaut corrige le 2026-08-16 sur confirm_receipt. Le corps est repris
-- caractere pour caractere de 20260822_01 ; seuls la signature et la ligne du
-- tarif changent.
drop function if exists public.place_orders_batch(uuid, jsonb, text, text, bigint);

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
    -- CHANGEMENT 2026-09-03 : prix a la DISTANCE quand elle est fiable.
    -- delivery_fee_for_shop rend NULL des que l'un des deux points n'est pas
    -- un vrai pin (coordonnees encore egales au centroide de la ville) : on
    -- retombe alors sur le forfait, plutot que de facturer une geometrie
    -- fictive. La propriete de 2026-08-22 tient toujours — chaque montant
    -- reste un entier, donc la somme des totaux retombe exactement sur le
    -- montant paye, egalite que process_batch_intent_outcome verifie avant
    -- d'alimenter le sequestre.
    if p_delivery_mode = 'delivery' and p_address_id is not null then
      v_shop_delivery := coalesce(
        public.delivery_fee_for_shop(v_shop, p_address_id),
        v_delivery_fee);
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

-- Supabase re-accorde EXECUTE a anon/authenticated a chaque (re)creation d'une
-- fonction SECURITY DEFINER : le retrait doit etre rejoue, sur la NOUVELLE
-- signature.
revoke all on function public.place_orders_batch(uuid, jsonb, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.place_orders_batch(uuid, jsonb, text, text, bigint, uuid) to service_role;
