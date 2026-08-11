-- ============================================================================
-- Booking payment on the Orange/MTN (Lengopay) rail — replaces the DROPPED
-- Stripe rail for rentals (client 2026-07-29: "la signature ne marche pas" —
-- root cause was Stripe, unavailable in Guinea). ISOLATED from the product-order
-- intent path: order intents keep booking_id NULL and remain the ONLY ones the
-- existing pick_intents_to_poll / expire_stale_intents act on. Booking intents
-- get their own pick / process / expire fns + a dedicated cron step, so the
-- working product-order payment flow is byte-for-byte untouched.
-- Apply on prod (mkaddhcjneilvwqethjo) via the SQL Editor.
-- ============================================================================

-- 1) payment_intents becomes polymorphic (exactly one of order_id / booking_id).
--    Existing rows all have order_id set → they satisfy the new CHECK.
alter table public.payment_intents alter column order_id drop not null;
alter table public.payment_intents
  add column if not exists booking_id uuid references public.bookings(id) on delete cascade;
alter table public.payment_intents drop constraint if exists payment_intents_one_target;
alter table public.payment_intents
  add constraint payment_intents_one_target check (num_nonnulls(order_id, booking_id) = 1);
create index if not exists payment_intents_booking_idx
  on public.payment_intents (booking_id) where booking_id is not null;

-- 2) Scope the ORDER pollers to ORDER intents only (booking_id IS NULL) so the
--    booking intents never reach the order code paths (which would 404 on the
--    orders lookup). Bodies are otherwise identical to the live versions.
create or replace function public.pick_intents_to_poll(p_limit integer default 200)
 returns setof public.payment_intents
 language sql security definer set search_path to ''
as $function$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.booking_id is null
    and pi.created_at > now() - interval '15 minutes'
    and (
      (pi.created_at > now() - interval '60 seconds'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '5 seconds'))
      or
      (pi.created_at <= now() - interval '60 seconds'
        and pi.created_at > now() - interval '5 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '15 seconds'))
      or
      (pi.created_at <= now() - interval '5 minutes'
        and pi.created_at > now() - interval '15 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '30 seconds'))
    )
  order by pi.created_at
  limit p_limit
  for update skip locked;
$function$;

create or replace function public.expire_stale_intents()
 returns integer
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_count  int := 0;
  v_intent record;
  v_now    timestamptz := now();
begin
  for v_intent in
    select id, order_id from public.payment_intents
    where status = 'pending'
      and rail = 'lengopay'
      and booking_id is null
      and created_at < v_now - interval '15 minutes'
      and (last_polled_at is null or last_error_code is null)
    for update skip locked
  loop
    update public.payment_intents
      set status = 'expired', completed_at = v_now, updated_at = v_now
      where id = v_intent.id;
    update public.orders
      set status = 'cancelled',
          events = events || jsonb_build_array(jsonb_build_object('at', v_now, 'label', 'Paiement expiré')),
          updated_at = v_now
      where id = v_intent.order_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

-- 3) Booking-only pollers (mirror the order ones, scoped to booking intents).
create or replace function public.pick_booking_intents_to_poll(p_limit integer default 200)
 returns setof public.payment_intents
 language sql security definer set search_path to ''
as $function$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.booking_id is not null
    and pi.created_at > now() - interval '15 minutes'
    and (
      (pi.created_at > now() - interval '60 seconds'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '5 seconds'))
      or
      (pi.created_at <= now() - interval '60 seconds'
        and pi.created_at > now() - interval '5 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '15 seconds'))
      or
      (pi.created_at <= now() - interval '5 minutes'
        and pi.created_at > now() - interval '15 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '30 seconds'))
    )
  order by pi.created_at
  limit p_limit
  for update skip locked;
$function$;

-- Terminal outcome for a BOOKING intent. On success, delegates to the existing
-- confirm_booking_payment (one-sided escrow credit + accepted→paid, idempotent,
-- overlap-guarded). On failure/cancel: no fund movement, and the booking stays
-- 'accepted' so the tenant can retry a fresh sign-pay.
create or replace function public.process_booking_intent_outcome(
  p_intent_id uuid, p_terminal_status text, p_rail_status text, p_error_code text, p_error_message text)
 returns void
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_intent record;
  v_result text;
  v_now    timestamptz := now();
begin
  if p_terminal_status not in ('completed','failed','cancelled') then
    raise exception 'INVALID_TERMINAL_STATUS';
  end if;

  select * into v_intent from public.payment_intents where id = p_intent_id for update;
  if not found then raise exception 'INTENT_NOT_FOUND'; end if;
  if v_intent.booking_id is null then raise exception 'NOT_A_BOOKING_INTENT'; end if;
  if v_intent.status <> 'pending' then
    raise notice 'process_booking_intent_outcome: intent % already %, skipping', p_intent_id, v_intent.status;
    return;
  end if;

  if p_terminal_status = 'completed' then
    v_result := public.confirm_booking_payment(v_intent.booking_id);
    -- 'confirmed' | 'noop' (already paid) = fine. 'conflict' = money captured on
    -- the rail but another overlapping booking took the slot → manual refund via
    -- admin (surface loudly). 'unknown' = booking vanished (should not happen).
    if v_result in ('conflict','unknown') then
      raise warning 'process_booking_intent_outcome: booking % captured but result=% — manual refund needed (intent %)',
        v_intent.booking_id, v_result, p_intent_id;
    end if;
  end if;

  update public.payment_intents
    set status = p_terminal_status, rail_status = p_rail_status,
        last_error_code = p_error_code, last_error_message = p_error_message,
        completed_at = v_now, updated_at = v_now
    where id = p_intent_id;
end;
$function$;

-- Sweep stale pending BOOKING intents (>15 min). Just mark the intent expired;
-- the booking stays 'accepted' (payable via a fresh sign-pay), no fund movement.
create or replace function public.expire_stale_booking_intents()
 returns integer
 language plpgsql security definer set search_path to ''
as $function$
declare v_count int := 0; v_now timestamptz := now();
begin
  update public.payment_intents
    set status = 'expired', completed_at = v_now, updated_at = v_now
    where status = 'pending' and rail = 'lengopay' and booking_id is not null
      and created_at < v_now - interval '15 minutes'
      and (last_polled_at is null or last_error_code is null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- New SECURITY DEFINER fns → revoke default anon/authenticated grants (kept the
-- 2026-07-29 lockdown); the cron calls them with service_role.
revoke all on function public.pick_booking_intents_to_poll(integer) from public, anon, authenticated;
grant execute on function public.pick_booking_intents_to_poll(integer) to service_role;
revoke all on function public.process_booking_intent_outcome(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.process_booking_intent_outcome(uuid, text, text, text, text) to service_role;
revoke all on function public.expire_stale_booking_intents() from public, anon, authenticated;
grant execute on function public.expire_stale_booking_intents() to service_role;
