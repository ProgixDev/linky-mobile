-- Block H.1 — Orders schema + atomic place_order RPC. Mirrors the frontend Order
-- type so screens consume the row shape without translation. payment_method enum
-- includes all four UI variants; for now only 'wallet' is actually processed
-- (debits the buyer's wallet into escrow). Provider payments (orange-money,
-- mtn-money, card) are Phase J — validator accepts them but place_order rejects
-- with PAYMENT_METHOD_NOT_SUPPORTED until wired.
--
-- Escrow flow: place_order debits the buyer with ref_type='order_escrow'. On
-- confirm-receipt (next session), the seller will be credited with
-- ref_type='order_release'. Fees stay on the platform side (separate ledger
-- entry / dedicated platform wallet) — V1 just absorbs them implicitly.

create table if not exists public.orders (
  id                uuid primary key default public.uuidv7(),
  reference         text not null unique,
  buyer_id          uuid not null references public.users(id) on delete cascade,
  seller_id         uuid not null references public.users(id) on delete cascade,
  shop_id           uuid not null references public.shops(id),
  product_id        uuid not null references public.products(id),
  product_snapshot  jsonb not null,
  quantity          int not null check (quantity > 0),
  amount_minor      bigint not null,
  fees_minor        bigint not null,
  total_minor       bigint not null,
  payment_method    text not null
                    check (payment_method in ('orange-money','mtn-money','card','wallet')),
  status            text not null default 'placed'
                    check (status in ('placed','paid','preparing','delivered','released','disputed')),
  events            jsonb not null default '[]',
  release_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists orders_buyer_idx on public.orders(buyer_id, created_at desc);
create index if not exists orders_seller_idx on public.orders(seller_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status);
alter table public.orders enable row level security;
-- No public policies: service_role only via edge functions.

-- Reference generator: LK-YYYY-NNNNN. Sequence guarantees uniqueness even across
-- concurrent inserts; year prefix makes refs human-grouped.
create sequence if not exists public.order_reference_seq start 10000;

create or replace function public.generate_order_reference()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_num  int := nextval('public.order_reference_seq');
begin
  return 'LK-' || v_year || '-' || lpad(v_num::text, 5, '0');
end;
$$;

-- place_order — atomic: lock product, validate, lock buyer wallet, balance check,
-- insert order, append ledger debit. Returns the new order id; edge function does
-- a separate read to assemble the response so SQL stays tight.
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
  v_wallet_id     uuid;
  v_balance       bigint;
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

  select id into v_wallet_id from public.wallets
    where user_id = p_buyer_id and currency = 'GNF'
    for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  v_balance := coalesce(
    (select balance_after from public.ledger_entries
       where wallet_id = v_wallet_id
       order by created_at desc, id desc
       limit 1), 0);
  if v_balance < v_total_minor then raise exception 'INSUFFICIENT_BALANCE'; end if;

  insert into public.orders (
    reference, buyer_id, seller_id, shop_id, product_id,
    product_snapshot, quantity, amount_minor, fees_minor, total_minor,
    payment_method, status, events, release_at
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
    'paid',
    jsonb_build_array(
      jsonb_build_object('at', v_now, 'label', 'Commande passée'),
      jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')
    ),
    v_now + interval '72 hours'
  )
  returning id into v_order_id;

  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values (v_wallet_id, 'debit', v_total_minor, v_balance - v_total_minor, 'order_escrow', v_order_id);

  return v_order_id;
end;
$$;

revoke all on function public.place_order(uuid, uuid, int, text) from public, anon, authenticated;
grant execute on function public.place_order(uuid, uuid, int, text) to service_role;
