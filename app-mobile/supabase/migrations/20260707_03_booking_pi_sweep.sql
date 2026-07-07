-- Booking PI sweep picker (launch-audit follow-up, 2026-07-07).
--
-- booking-sign-pay creates a Stripe PaymentIntent and stamps it on
-- bookings.stripe_pi_id, but nothing ever expired it: an abandoned payment
-- sheet stayed chargeable indefinitely (the stale-Stripe sweep in
-- cron-poll-intents only reads payment_intents rows — booking PIs don't
-- live there).
--
-- TTL is 24 HOURS, not 15 minutes, on purpose: booking-sign-pay re-calls use
-- Stripe idempotencyKey 'booking-pi-<id>' (review DEFECT-2 double-charge
-- guard), and Stripe idempotency keys replay for ~24h. Cancelling a PI inside
-- that window would hand a returning tenant the same *canceled* PI and brick
-- their payment. After 24h the key has expired server-side, so the next
-- sign-pay mints a fresh PI.
--
-- Also sweeps bookings that left the payable state with a PI still attached
-- (cancelled/rejected after the sheet was opened) — pure charge-window
-- closure.
--
-- cron-poll-intents consumes these rows: Stripe-cancel FIRST, then clears
-- stripe_pi_id locally (booking status is NOT touched — 'accepted' stays
-- payable through a fresh sign-pay call).

create or replace function public.pick_stale_booking_pis(p_limit int default 20)
returns table (
  booking_id   uuid,
  stripe_pi_id text,
  status       text
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
    select b.id, b.stripe_pi_id, b.status
      from public.bookings b
      where b.stripe_pi_id is not null
        and b.status in ('accepted', 'cancelled', 'rejected')
        and b.updated_at < now() - interval '24 hours'
      order by b.updated_at asc
      for update of b skip locked
      limit p_limit;
end;
$$;

revoke all on function public.pick_stale_booking_pis(int) from public, anon, authenticated;
grant execute on function public.pick_stale_booking_pis(int) to service_role;
