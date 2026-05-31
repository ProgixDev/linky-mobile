-- H2 Step B — place_order learns wallet escrow.
-- When payment_method='wallet': auto-create buyer GNF wallet (idempotent),
-- insert the order at status='paid' with both placement + escrow events,
-- then post_transfer total_minor buyer→escrow_gnf (ref_type='order_escrow').
-- post_transfer's INSUFFICIENT_FUNDS rolls the order INSERT back atomically.
-- Non-wallet methods continue raising PAYMENT_METHOD_NOT_SUPPORTED.

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
  if p_payment_method <> 'wallet' then
    raise exception 'PAYMENT_METHOD_NOT_SUPPORTED';
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

  -- Auto-create buyer GNF wallet (idempotent — confirm_topup uses this pattern).
  insert into public.wallets (user_id, currency)
    values (p_buyer_id, 'GNF')
    on conflict (user_id, currency) do nothing;

  select id into v_buyer_wallet_id
    from public.wallets
    where user_id = p_buyer_id and currency = 'GNF';

  select id into v_escrow_wallet_id
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

  -- Order row first so the ledger entries can reference its id as ref_id.
  insert into public.orders (
    reference, buyer_id, seller_id, shop_id, product_id,
    product_snapshot, quantity, amount_minor, fees_minor, total_minor,
    payment_method, status, events
  ) values (
    v_reference,
    p_buyer_id,
    v_seller_id,
    v_product.shop_id,
    v_product.id,
    jsonb_build_object(
      'title',    v_product.title,
      'photo',    coalesce(v_product.photos[1], ''),
      'priceGnf', v_product.price_minor
    ),
    p_quantity,
    v_amount_minor,
    v_fees_minor,
    v_total_minor,
    p_payment_method,
    'paid',
    jsonb_build_array(
      jsonb_build_object('at', v_now, 'label', 'Commande passée'),
      jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')
    )
  )
  returning id into v_order_id;

  -- Buyer → escrow for amount + fees. post_transfer raises INSUFFICIENT_FUNDS
  -- on empty/short balance; it rolls back the order INSERT atomically.
  -- It also handles wallet locking internally (deterministic id-order FOR UPDATE).
  perform public.post_transfer(
    v_buyer_wallet_id,
    v_escrow_wallet_id,
    v_total_minor,
    'order_escrow',
    v_order_id
  );

  return v_order_id;
end;
$$;
