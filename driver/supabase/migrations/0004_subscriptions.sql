-- 0004_subscriptions — server-owned entitlement (NEVER trust the client).
--
-- The client may only READ its own row. There is deliberately NO client
-- insert/update/delete policy, so the event "deny-by-default" applies to writes.
-- Only the payments webhook (running with the service_role key, which bypasses
-- RLS) writes entitlement state. See supabase/functions/revenuecat-webhook and
-- docs/research/06-payments-analytics-stack.md.

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'inactive'
    check (status in ('active', 'inactive', 'grace', 'expired')),
  product_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
-- READ ONLY for clients. No write grant => clients cannot write entitlement.
grant select on public.subscriptions to authenticated;

create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Gate premium features by joining this table in your feature policies, e.g.:
--   using (
--     (select auth.uid()) = user_id
--     and exists (
--       select 1 from public.subscriptions s
--       where s.user_id = (select auth.uid()) and s.status = 'active'
--     )
--   )
