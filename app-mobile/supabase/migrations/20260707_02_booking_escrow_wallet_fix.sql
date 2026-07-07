-- CRITICAL fix (found during the 2026-07-07 launch audit follow-up).
--
-- 20260706_01's booking RPCs treated the system USER ids
-- ('…0001' escrow / '…0002' platform) as WALLET ids. wallets.id is a
-- generated uuidv7 (the H2 setup inserts system wallets by user_id only), so:
--   - confirm_booking_payment inserted a ledger row with wallet_id='…0001'
--     → FK violation → the stripe-webhook booking branch fails AFTER the
--     charge is captured: tenant charged, booking stuck 'accepted'
--     (Stripe keeps retrying the webhook, every retry fails the same way);
--   - release_booking / the fee transfer would fail identically at
--     post_transfer's wallet lookup.
-- The ORDER rails always resolved the wallet via user_id (20260531_04) —
-- the booking flow just didn't copy that part.
--
-- This recreates both RPCs with the correct resolution. Behavior is otherwise
-- byte-identical (overlap guard, idempotence, events, property reserve).

-- ============================================================================
-- confirm_booking_payment — fixed escrow wallet resolution.
-- ============================================================================
create or replace function public.confirm_booking_payment(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking          record;
  v_escrow_wallet_id uuid;
  v_escrow_bal       bigint;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then return 'unknown'; end if;
  if v_booking.status <> 'accepted' then return 'noop'; end if;

  -- Last-line overlap guard (review DEFECT-1): if another booking on this
  -- property was paid/activated in the meantime, do NOT credit — the captured
  -- charge must be refunded manually (the webhook logs CRITICAL on 'conflict').
  if exists (
    select 1 from public.bookings b
    where b.property_id = v_booking.property_id
      and b.id <> p_booking_id
      and b.status in ('paid', 'active')
      and (b.period = 'month' or v_booking.period = 'month'
           or (b.start_date < v_booking.end_date and v_booking.start_date < b.end_date))
  ) then
    return 'conflict';
  end if;

  -- Resolve the ESCROW WALLET by its system user id (wallets.id is generated;
  -- '…0001' is the USER id — the pre-fix code confused the two).
  select id into v_escrow_wallet_id from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF'
   for update;
  if v_escrow_wallet_id is null then
    raise exception 'ESCROW_WALLET_MISSING';
  end if;

  v_escrow_bal := coalesce((select balance_after from public.ledger_entries
                            where wallet_id = v_escrow_wallet_id
                            order by created_at desc, id desc limit 1), 0);
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values (v_escrow_wallet_id, 'credit', v_booking.total_minor, v_escrow_bal + v_booking.total_minor,
            'booking_escrow', p_booking_id);

  update public.bookings
     set status = 'paid',
         tenant_signed_at = coalesce(tenant_signed_at, now()),
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(), 'label', 'Contrat signé — paiement reçu en séquestre')),
         updated_at = now()
   where id = p_booking_id;

  -- MONTHLY leases occupy the property → surface it as 'reserved' (feeds the
  -- landlord dashboard "leased" stat and blocks new booking requests).
  -- DAILY stays deliberately leave the property 'active' so future dates stay
  -- bookable — the date-overlap guard is what protects daily conflicts.
  if v_booking.period = 'month' then
    update public.properties set status = 'reserved', updated_at = now()
     where id = v_booking.property_id and status = 'active';
  end if;

  return 'confirmed';
end;
$$;

revoke all on function public.confirm_booking_payment(uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking_payment(uuid) to service_role;

-- ============================================================================
-- release_booking — fixed escrow + platform wallet resolution.
-- ============================================================================
create or replace function public.release_booking(p_booking_id uuid, p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking            record;
  v_escrow_wallet_id   uuid;
  v_platform_wallet_id uuid;
  v_landlord_wallet    uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.tenant_id <> p_tenant_id then raise exception 'FORBIDDEN'; end if;
  if v_booking.status <> 'paid' then raise exception 'INVALID_STATUS'; end if;

  select id into v_escrow_wallet_id from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';
  select id into v_platform_wallet_id from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';
  if v_escrow_wallet_id is null or v_platform_wallet_id is null then
    raise exception 'SYSTEM_WALLET_MISSING';
  end if;

  select id into v_landlord_wallet from public.wallets
   where user_id = v_booking.landlord_id and currency = 'GNF';
  if v_landlord_wallet is null then
    insert into public.wallets (user_id, currency)
      values (v_booking.landlord_id, 'GNF')
      on conflict (user_id, currency) do update set updated_at = now()
      returning id into v_landlord_wallet;
  end if;

  perform public.post_transfer(v_escrow_wallet_id, v_landlord_wallet, v_booking.amount_minor,
                               'booking_release', p_booking_id);
  if v_booking.fees_minor > 0 then
    perform public.post_transfer(v_escrow_wallet_id, v_platform_wallet_id, v_booking.fees_minor,
                                 'booking_platform_fee', p_booking_id);
  end if;

  update public.bookings
     set status = 'active',
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(), 'label', 'Emménagement confirmé — loyer versé au propriétaire')),
         updated_at = now()
   where id = p_booking_id;

  return 'released';
end;
$$;

revoke all on function public.release_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_booking(uuid, uuid) to service_role;
