-- Block H.1.fix — place_order rolled back to "just the row" per V1 scope. The
-- previous version debited the buyer's wallet into escrow inside the same tx;
-- H1 isolates order creation only, leaving the full escrow lifecycle (debit +
-- release vs dispute) to H2's confirm-receipt RPC. Status defaults to 'placed'
-- (not 'paid'); H2 will move it to 'paid' when wallet escrow lands, or skip the
-- 'paid' intermediate for provider-rail payments.

create or replace function public.place_order(
  p_buyer_id        uuid,
  p_product_id      uuid,
  p_quantity        int,
  p_payment_method  text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product       record;
  v_seller_id     uuid;
  v_amount_minor  bigint;
  v_fees_minor    bigint;
  v_total_minor   bigint;
  v_order_id      uuid;
  v_reference     text;
  v_now           timestamptz := now();
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
      'title',     v_product.title,
      'photo',     coalesce(v_product.photos[1], ''),
      'priceGnf',  v_product.price_minor
    ),
    p_quantity,
    v_amount_minor,
    v_fees_minor,
    v_total_minor,
    p_payment_method,
    'placed',
    jsonb_build_array(
      jsonb_build_object('at', v_now, 'label', 'Commande passée')
    )
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;
