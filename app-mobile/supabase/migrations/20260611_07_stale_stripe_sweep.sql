-- Phase V.6 -- stale Stripe PI sweep helper.
--
-- expire_stale_intents (20260610_03) is intentionally Lengopay-only : a
-- stripe intent expired locally could still be paid through a stale payment
-- sheet afterwards, producing a money-taken / order-cancelled mismatch.
-- The Q-1 backlog fix is a server-side sweep that cancels the Stripe PI
-- FIRST (closes the charge window via the Stripe API), then -- and only on
-- confirmed cancel -- flips the local intent + order to cancelled through
-- the existing process_intent_outcome path. Order of operations IS the
-- safety property : if the API cancel succeeds, we know no further charge
-- can land ; if it fails, we leave the intent for the webhook or the next
-- buyer-initiated cancel-pending-payment call.
--
-- This migration adds the picker RPC ; cron-poll-intents (separate fn deploy)
-- consumes the rows and orchestrates the API-cancel-then-local-cancel.
--
-- Why a sibling picker rather than reusing pick_intents_to_poll : the
-- existing picker is backoff-aware (last_polled_at + attempts_count) and
-- designed for the per-5s Lengopay status check. Stripe doesn't need that
-- backoff -- we only want to sweep intents older than the 15-minute TTL
-- that are also pending. FOR UPDATE SKIP LOCKED keeps the cron worker
-- single-flight even if two ticks overlap.

create or replace function public.pick_stale_stripe_intents(p_limit int default 50)
returns table (
  id              uuid,
  order_id        uuid,
  rail_intent_id  text,
  amount_minor    bigint,
  created_at      timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
    select i.id, i.order_id, i.rail_intent_id, i.amount_minor, i.created_at
      from public.payment_intents i
      where i.status = 'pending'
        and i.rail = 'stripe'
        -- Don't sweep brand-new intents whose PI id is still the
        -- 'pending-init-' placeholder ; the init may not have completed
        -- yet. They get a normal 15-minute TTL only once the real Stripe
        -- PI id is attached (place-order's init path overwrites
        -- rail_intent_id ; see 20260610_03).
        and i.rail_intent_id not like 'pending-init-%'
        and i.created_at < now() - interval '15 minutes'
      order by i.created_at asc
      for update of i skip locked
      limit p_limit;
end;
$$;

revoke all on function public.pick_stale_stripe_intents(int)
  from public, anon, authenticated;
grant execute on function public.pick_stale_stripe_intents(int)
  to service_role;
