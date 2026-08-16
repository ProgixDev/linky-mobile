-- ============================================================================
-- Stock des produits — le panier ne peut plus depasser la quantite disponible.
-- Client 2026-08-13 : « Si le vendeur a mis 2 articles lors de la publication,
-- le client ne peut pas ajouter plus de deux articles dans son panier. »
--
-- stock NULL = quantite non renseignee : aucune limite. Toutes les annonces
-- publiees avant cette migration sont dans ce cas, leur comportement ne change
-- donc pas. Une annonce creee apres porte une quantite.
--
-- Le plafond du panier cote app est du CONFORT. La verite est ici : place_order_multi
-- verrouille deja la ligne produit, on y ajoute le controle et le decrement dans
-- la meme transaction.
--
-- Applique en prod (mkaddhcjneilvwqethjo) via l editeur SQL.
-- ============================================================================

alter table public.products
  add column if not exists stock integer;
alter table public.products drop constraint if exists products_stock_check;
alter table public.products
  add constraint products_stock_check check (stock is null or stock >= 0);

-- Corps identique a 20260805_01, PATCHE : lecture de p.stock, controle, decrement.
create or replace function public.place_order_multi(
  p_buyer_id           uuid,
  p_items              jsonb,   -- [{"product_id":"<uuid>","quantity":2}, ...]
  p_payment_method     text,
  p_delivery_mode      text default 'delivery',
  p_delivery_fee_minor bigint default 0
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_item             jsonb;
  v_product          record;
  v_first            record;
  v_seller_id        uuid;
  v_shop_id          uuid;
  v_qty              integer;
  v_line_amount      bigint;
  v_amount_minor     bigint := 0;
  v_fees_minor       bigint;
  v_delivery_fee     bigint;
  v_total_minor      bigint;
  v_order_id         uuid;
  v_reference        text;
  v_now              timestamptz := now();
  v_buyer_wallet_id  uuid;
  v_escrow_wallet_id uuid;
  v_lines            jsonb := '[]'::jsonb;
  v_seen             uuid[] := '{}';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_ITEMS';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'TOO_MANY_ITEMS';
  end if;
  if p_delivery_mode is null or p_delivery_mode not in ('pickup', 'delivery') then
    raise exception 'INVALID_DELIVERY_MODE';
  end if;

  -- Delivery is charged once per ORDER, not per article (one seller, one drop).
  if p_delivery_mode = 'pickup' then
    v_delivery_fee := 0;
  else
    v_delivery_fee := coalesce(p_delivery_fee_minor, 0);
    if v_delivery_fee < 0 then raise exception 'INVALID_DELIVERY_FEE'; end if;
  end if;

  -- Pass 1 — lock every product, validate, and total up.
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

    -- Stock (client 2026-08-13) : le vendeur declare une quantite a la
    -- publication, on ne peut pas en commander plus. stock NULL = non renseigne
    -- (annonces d'avant cette migration) et ne plafonne rien. Le controle est
    -- ICI et pas seulement dans le panier : la ligne produit est deja verrouillee
    -- par le for update ci-dessus, donc deux acheteurs simultanes sur le dernier
    -- article ne peuvent pas passer tous les deux.
    if v_product.stock is not null then
      if v_product.stock <= 0 then raise exception 'OUT_OF_STOCK'; end if;
      if v_qty > v_product.stock then raise exception 'INSUFFICIENT_STOCK'; end if;
      update public.products set stock = stock - v_qty where id = v_product.id;
    end if;

    -- The same article twice in one payload would double-charge silently.
    if v_product.id = any(v_seen) then raise exception 'DUPLICATE_ITEM'; end if;
    v_seen := v_seen || v_product.id;

    if v_shop_id is null then
      v_shop_id  := v_product.shop_id;
      v_seller_id := v_product.owner_id;
      v_first    := v_product;
    elsif v_product.shop_id <> v_shop_id then
      -- Enforced here too, not only in the app: one order can never mix sellers,
      -- otherwise a single escrow would owe money to two people.
      raise exception 'MULTIPLE_SELLERS';
    end if;

    if v_seller_id = p_buyer_id then raise exception 'BUYER_IS_SELLER'; end if;

    v_line_amount  := v_product.price_minor * v_qty;
    v_amount_minor := v_amount_minor + v_line_amount;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'quantity', v_qty,
      'unit_price_minor', v_product.price_minor,
      'amount_minor', v_line_amount,
      'snapshot', jsonb_build_object(
        'title', v_product.title,
        'photo', coalesce(v_product.photos[1], ''),
        'priceGnf', v_product.price_minor
      )
    ));
  end loop;

  v_fees_minor  := round(v_amount_minor * 0.03);
  v_total_minor := v_amount_minor + v_fees_minor + v_delivery_fee;
  v_reference   := public.generate_order_reference();

  -- orders.* keep the PRIMARY article so every existing reader stays valid.
  insert into public.orders (
    reference, buyer_id, seller_id, shop_id, product_id,
    product_snapshot, quantity, amount_minor, fees_minor, total_minor,
    delivery_mode, delivery_fee_minor,
    payment_method, status, events
  ) values (
    v_reference, p_buyer_id, v_seller_id, v_shop_id, v_first.id,
    jsonb_build_object('title', v_first.title, 'photo', coalesce(v_first.photos[1], ''), 'priceGnf', v_first.price_minor),
    coalesce(((p_items -> 0) ->> 'quantity')::int, 1),
    v_amount_minor, v_fees_minor, v_total_minor,
    p_delivery_mode, v_delivery_fee,
    p_payment_method,
    case when p_payment_method = 'wallet' then 'paid' else 'placed' end,
    case when p_payment_method = 'wallet' then
      jsonb_build_array(
        jsonb_build_object('at', v_now, 'label', 'Commande passée'),
        jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')
      )
    else
      jsonb_build_array(jsonb_build_object('at', v_now, 'label', 'Commande passée'))
    end
  )
  returning id into v_order_id;

  -- Pass 2 — every article, including the primary one, so the order lines are
  -- complete on their own and a reader never has to merge two shapes.
  insert into public.order_items (order_id, product_id, product_snapshot, quantity, unit_price_minor, amount_minor)
  select
    v_order_id,
    (l ->> 'product_id')::uuid,
    l -> 'snapshot',
    (l ->> 'quantity')::int,
    (l ->> 'unit_price_minor')::bigint,
    (l ->> 'amount_minor')::bigint
  from jsonb_array_elements(v_lines) as l;

  -- Wallet pays immediately into escrow; rails settle later (cron-poll-intents
  -- / stripe-webhook credit escrow with total_minor). Identical to place_order.
  if p_payment_method = 'wallet' then
    insert into public.wallets (user_id, currency)
      values (p_buyer_id, 'GNF')
      on conflict (user_id, currency) do nothing;

    select id into v_buyer_wallet_id
      from public.wallets where user_id = p_buyer_id and currency = 'GNF';

    select id into v_escrow_wallet_id
      from public.wallets
      where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

    perform public.post_transfer(
      v_buyer_wallet_id, v_escrow_wallet_id, v_total_minor,
      'order_escrow', v_order_id
    );
  end if;

  return v_order_id;
end;
$function$;

revoke all on function public.place_order_multi(uuid, jsonb, text, text, bigint) from public, anon, authenticated;
grant execute on function public.place_order_multi(uuid, jsonb, text, text, bigint) to service_role;
