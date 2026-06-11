-- Final sprint §2 — admin moderation + real overview KPIs.
--
-- 'removed' status : admin takedown needs a value sellers can NOT set or
-- revert ('paused' is freely settable via product-update / property-update,
-- so a takedown using it would be seller-revertible). 'removed' is excluded
-- from the update fns' validators ; the fns additionally refuse ALL edits on
-- a removed listing, so reinstatement is admin-only (moderate-listing
-- 'approve'). Public list endpoints filter status='active', so 'removed' is
-- structurally unlisted.

alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check
  check (status in ('active','reserved','sold','paused','pending','removed'));

alter table public.properties drop constraint if exists properties_status_check;
alter table public.properties add constraint properties_status_check
  check (status in ('active','reserved','sold','paused','pending','removed'));

-- ===========================================================================
-- admin_overview : every console KPI in one round-trip. Counts are exact —
-- V1 volumes are small ; revisit with estimates if tables grow past ~100k.
-- GMV = orders that actually got paid (everything past 'placed' except
-- cancelled / refunded), summed on total_minor (what buyers paid).
-- ===========================================================================
create or replace function public.admin_overview()
returns table (
  users_count          bigint,
  listings_active      bigint,
  listings_pending     bigint,
  orders_total         bigint,
  orders_placed        bigint,
  orders_paid          bigint,
  orders_preparing     bigint,
  orders_delivered     bigint,
  orders_released      bigint,
  orders_disputed      bigint,
  orders_cancelled     bigint,
  orders_refunded      bigint,
  kyc_pending          bigint,
  withdrawals_pending  bigint,
  gmv_minor            bigint
)
language sql
security definer
set search_path to ''
as $$
  select
    (select count(*) from public.users),
    (select count(*) from public.products   where status = 'active')
      + (select count(*) from public.properties where status = 'active'),
    (select count(*) from public.products   where status = 'pending')
      + (select count(*) from public.properties where status = 'pending'),
    (select count(*) from public.orders),
    (select count(*) from public.orders where status = 'placed'),
    (select count(*) from public.orders where status = 'paid'),
    (select count(*) from public.orders where status = 'preparing'),
    (select count(*) from public.orders where status = 'delivered'),
    (select count(*) from public.orders where status = 'released'),
    (select count(*) from public.orders where status = 'disputed'),
    (select count(*) from public.orders where status = 'cancelled'),
    (select count(*) from public.orders where status = 'refunded'),
    (select count(*) from public.kyc_sessions where status in ('pending', 'in_review')),
    (select count(*) from public.withdrawal_requests where status = 'pending'),
    (select coalesce(sum(total_minor), 0) from public.orders
       where status not in ('placed', 'cancelled', 'refunded'));
$$;

revoke all on function public.admin_overview() from public, anon, authenticated;
grant execute on function public.admin_overview() to service_role;
