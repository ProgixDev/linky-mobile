-- H2 Step A — escrow infrastructure.
-- 1) Two system users (escrow + platform), uuids 0...001 / 0...002.
-- 2) Four wallets: (system_escrow, GNF/EUR), (system_platform, GNF/EUR).
-- 3) Replace orders.status CHECK with the locked 8-value V1 enum.
-- All inserts idempotent so the migration can be re-run safely.

-- 1. System users
insert into public.users (id, display_name, status)
values
  ('00000000-0000-0000-0000-000000000001', '__system_escrow__',   'active'),
  ('00000000-0000-0000-0000-000000000002', '__system_platform__', 'active')
on conflict (id) do nothing;

-- 2. System wallets (unique on (user_id, currency))
insert into public.wallets (user_id, currency)
values
  ('00000000-0000-0000-0000-000000000001', 'GNF'),
  ('00000000-0000-0000-0000-000000000001', 'EUR'),
  ('00000000-0000-0000-0000-000000000002', 'GNF'),
  ('00000000-0000-0000-0000-000000000002', 'EUR')
on conflict (user_id, currency) do nothing;

-- 3. Replace orders.status CHECK with the locked V1 enum.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in (
    'placed',     -- rails only, future
    'paid',       -- wallet now; rails Phase I/I'
    'preparing',  -- seller marks, future
    'delivered',  -- seller marks, future
    'released',   -- buyer confirms, tonight
    'disputed',   -- buyer reports, tonight
    'refunded',   -- admin refunds, Phase K
    'cancelled'   -- pre-payment cancel, future
  ));
