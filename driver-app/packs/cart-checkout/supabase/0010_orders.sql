-- cart-checkout — products + orders. RLS-first.
-- RLS is auto-enabled by the skeleton's 0001 event trigger.
-- SECURITY RULE: prices come from the DB, never the client. The cart only sends
-- {product_id, qty}; place_order() looks up the real price and computes the total
-- server-side. A client that posts its own price is simply ignored.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'usd' check (char_length(currency) = 3),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.products to authenticated;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'fulfilled')),
  total_cents integer not null default 0 check (total_cents >= 0),
  currency text not null default 'usd',
  created_at timestamptz not null default now()
);
grant select on public.orders to authenticated;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  qty integer not null check (qty between 1 and 999),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);
grant select on public.order_items to authenticated;

-- products are public read (catalog). Orders/items are read-own; there is NO
-- client write policy on orders/items — they are created only by place_order().
create policy "products: public read" on public.products
  for select to authenticated using (active);

create policy "orders: read own" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));

create policy "order_items: read own" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_id and o.user_id = (select auth.uid())));

-- Place an order from a cart. Prices are read from products (server-trusted).
-- SECURITY DEFINER so it can insert into the write-protected orders/items tables,
-- but it always stamps the order to the CALLER (auth.uid()), so no spoofing.
create or replace function public.place_order(items jsonb)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_order_id uuid;
  total integer := 0;
  item jsonb;
  pid uuid;
  q integer;
  price integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Cart is empty';
  end if;

  insert into public.orders (user_id, status, total_cents)
  values (uid, 'pending', 0)
  returning id into new_order_id;

  for item in select * from jsonb_array_elements(items) loop
    pid := (item->>'product_id')::uuid;
    q := (item->>'qty')::int;
    if q is null or q < 1 then
      raise exception 'Invalid quantity';
    end if;
    -- The price is taken from the DB, not the client payload.
    select price_cents into price from public.products where id = pid and active;
    if price is null then
      raise exception 'Product not available: %', pid;
    end if;
    insert into public.order_items (order_id, product_id, qty, unit_price_cents)
    values (new_order_id, pid, q, price);
    total := total + price * q;
  end loop;

  update public.orders set total_cents = total where id = new_order_id;
  return new_order_id;
end;
$$;

revoke all on function public.place_order(jsonb) from public;
grant execute on function public.place_order(jsonb) to authenticated;
