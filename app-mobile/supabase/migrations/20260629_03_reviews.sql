-- Reviews & ratings — a buyer rates the shop after a completed order (status
-- released/delivered). One review per (order, reviewer). The shop's denormalized
-- rating + review_count are recomputed by the create-review edge function on insert.
create table if not exists public.reviews (
  id          uuid primary key default public.uuidv7(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  reviewer_id uuid not null references public.users(id),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  seller_id   uuid not null references public.users(id),
  rating      int  not null check (rating between 1 and 5),
  comment     text check (char_length(comment) <= 1000),
  created_at  timestamptz not null default now(),
  unique (order_id, reviewer_id)
);

create index if not exists reviews_shop_created_idx on public.reviews (shop_id, created_at desc);

-- RLS on from creation (backend uses service_role, which bypasses it).
alter table public.reviews enable row level security;
