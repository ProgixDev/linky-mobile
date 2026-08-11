-- Multi-article orders from a SINGLE seller (client 2026-08-05).
--
-- The app's whole safety model is « 1 commande = 1 escrow = 1 vendeur =
-- 1 livraison = 1 QR ». Buying several articles from DIFFERENT sellers would
-- break that (one mobile-money payment can't be split across sellers), so it
-- stays out of scope. Buying several articles from the SAME seller does not:
-- it is still one seller, one escrow, one delivery, one QR.
--
-- Design is deliberately ADDITIVE. `orders.product_id` / `product_snapshot` /
-- `quantity` are NOT NULL and are read by ~30 files (order detail, seller
-- console, delivery, disputes, admin). They keep pointing at the PRIMARY
-- article, so every existing screen and function keeps working untouched;
-- the extra articles live in the new table below.

create table if not exists public.order_items (
  id                uuid primary key default uuidv7(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  product_id        uuid not null references public.products(id),
  -- Price/title/photo frozen at purchase time, exactly like orders.product_snapshot:
  -- a later edit or deletion of the product must never rewrite a past order.
  product_snapshot  jsonb not null,
  quantity          integer not null check (quantity > 0 and quantity <= 100),
  unit_price_minor  bigint not null check (unit_price_minor >= 0),
  amount_minor      bigint not null check (amount_minor >= 0),
  created_at        timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- Same posture as the rest of the schema: the app never touches tables
-- directly, everything goes through SECURITY DEFINER RPCs / edge functions.
alter table public.order_items enable row level security;

-- Places an order holding one OR MORE articles, all from the same shop.
-- Pricing is computed server-side from the products table — the client never
-- sends amounts, so a tampered payload cannot change what is charged.
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

    select p.id, p.shop_id, p.title, p.photos, p.price_minor, p.status, s.owner_id
      into v_product
      from public.products p
      join public.shops s on s.id = p.shop_id
      where p.id = (v_item ->> 'product_id')::uuid
      for update of p;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if v_product.status <> 'active' then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

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

-- 2026-07-29 hardening: the app never calls RPCs directly, so only the service
-- role may execute them. Supabase grants EXECUTE to PUBLIC by default on every
-- new function, hence this explicit revoke.
revoke all on function public.place_order_multi(uuid, jsonb, text, text, bigint) from public, anon, authenticated;
grant execute on function public.place_order_multi(uuid, jsonb, text, text, bigint) to service_role;
