-- Phase Q — Stripe test-mode card rail.
--
--   1. place_order : remove the Q5-era card rejection. 'card' now flows into
--      the rail branch (status='placed', no fund movement) exactly like
--      orange-money / mtn-money ; the edge function creates the Stripe
--      PaymentIntent and the stripe-webhook function drives the outcome.
--   2. pick_intents_to_poll : Lengopay-only. Stripe intents are webhook-driven;
--      polling them against the Lengopay status API would just record
--      RAIL_TRANSIENT errors forever.
--   3. expire_stale_intents : Lengopay-only. A stripe intent expired by TTL
--      could still be paid through a stale payment sheet afterwards →
--      money-taken / order-cancelled mismatch. Stripe terminal states arrive
--      via webhook (succeeded / canceled) ; abandoned card intents stay
--      pending until the buyer cancels (cancel-pending-payment also cancels
--      the Stripe PI). V1.1: server-side sweep that cancels stale stripe PIs
--      through the Stripe API, then expires the intent.
--
-- payment_intents.rail CHECK already allows 'stripe' (20260531_08) ; orders
-- payment_method CHECK already allows 'card' (20260531_01).

-- ===========================================================================
-- 1. place_order : card joins the rail branch.
-- ===========================================================================
create or replace function public.place_order(
  p_buyer_id       uuid,
  p_product_id     uuid,
  p_quantity       integer,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_product           record;
  v_seller_id         uuid;
  v_amount_minor      bigint;
  v_fees_minor        bigint;
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
  v_total_minor  := v_amount_minor + v_fees_minor;
  v_reference    := public.generate_order_reference();

  if p_payment_method = 'wallet' then
    -- WALLET BRANCH (unchanged from H2): atomic buyer->escrow transfer.
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
      payment_method, status, events
    ) values (
      v_reference, p_buyer_id, v_seller_id, v_product.shop_id, v_product.id,
      jsonb_build_object('title', v_product.title, 'photo', coalesce(v_product.photos[1], ''), 'priceGnf', v_product.price_minor),
      p_quantity, v_amount_minor, v_fees_minor, v_total_minor,
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
    -- RAIL BRANCH: insert at 'placed', no fund movement. Lengopay intents
    -- flip to 'paid' via cron-poll-intents ; stripe intents via stripe-webhook.
    insert into public.orders (
      reference, buyer_id, seller_id, shop_id, product_id,
      product_snapshot, quantity, amount_minor, fees_minor, total_minor,
      payment_method, status, events
    ) values (
      v_reference, p_buyer_id, v_seller_id, v_product.shop_id, v_product.id,
      jsonb_build_object('title', v_product.title, 'photo', coalesce(v_product.photos[1], ''), 'priceGnf', v_product.price_minor),
      p_quantity, v_amount_minor, v_fees_minor, v_total_minor,
      p_payment_method,
      'placed',
      jsonb_build_array(jsonb_build_object('at', v_now, 'label', 'Commande passée'))
    )
    returning id into v_order_id;
  end if;

  return v_order_id;
end;
$$;

-- ===========================================================================
-- 2. pick_intents_to_poll : Lengopay-only (stripe is webhook-driven).
-- ===========================================================================
create or replace function public.pick_intents_to_poll(p_limit int default 200)
returns setof public.payment_intents
language sql
security definer
set search_path to ''
as $$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.created_at > now() - interval '15 minutes'
    and (
      (pi.created_at > now() - interval '60 seconds'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '5 seconds'))
      or
      (pi.created_at <= now() - interval '60 seconds'
        and pi.created_at > now() - interval '5 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '15 seconds'))
      or
      (pi.created_at <= now() - interval '5 minutes'
        and pi.created_at > now() - interval '15 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '30 seconds'))
    )
  order by pi.created_at
  limit p_limit
  for update skip locked;
$$;

-- ===========================================================================
-- 3. expire_stale_intents : Lengopay-only (see header for the stripe rationale).
-- ===========================================================================
create or replace function public.expire_stale_intents()
returns int
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count  int := 0;
  v_intent record;
  v_now    timestamptz := now();
begin
  for v_intent in
    select id, order_id from public.payment_intents
    where status = 'pending'
      and rail = 'lengopay'
      and created_at < v_now - interval '15 minutes'
      and (last_polled_at is null or last_error_code is null)
    for update skip locked
  loop
    update public.payment_intents
      set status = 'expired',
          completed_at = v_now,
          updated_at = v_now
      where id = v_intent.id;

    update public.orders
      set status = 'cancelled',
          events = events || jsonb_build_array(
                     jsonb_build_object('at', v_now, 'label', 'Paiement expiré')
                   ),
          updated_at = v_now
      where id = v_intent.order_id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
