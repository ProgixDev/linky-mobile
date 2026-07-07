-- Admin booking tooling — closes the launch audit's "paid booking money can
-- get stuck with no admin exit" hole (2026-07-07).
--
-- The tenant is the only actor who can release a booking's escrow
-- (booking-checkin-confirm → release_booking). If the tenant vanishes after
-- paying, or the landlord scams, the money sits in escrow forever. This adds
-- the admin counterpart, mirroring resolve_dispute for orders:
--
--   admin_resolve_booking(admin, booking, action, reason)
--     action = 'refund'  : escrow → tenant (total = rent + 3% fee back),
--                          status → 'refunded', monthly property un-reserved
--     action = 'release' : escrow → landlord (rent) + platform (fee),
--                          status → 'active' (same transfers as
--                          release_booking, admin identity instead of tenant)
--     action = 'dispute' : status 'paid' → 'disputed' (freeze marker while
--                          the team investigates; no money moves)
--
-- Money actions are allowed from 'paid' or 'disputed' ONLY. Once a booking is
-- 'active' the escrow has already been paid out — clawbacks are a manual
-- support operation, not a one-click console action.
--
-- Every call re-checks users.is_admin inside the transaction (same posture as
-- resolve_dispute) and appends an admin_actions audit row.

create or replace function public.admin_resolve_booking(
  p_admin_id   uuid,
  p_booking_id uuid,
  p_action     text,
  p_reason     text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin           boolean;
  v_booking            record;
  -- Resolve the system WALLET ids by user id — wallets.id is generated, the
  -- '…0001'/'…0002' literals are USER ids (see 20260707_02's fix note).
  v_escrow_wallet_id   uuid;
  v_platform_wallet_id uuid;
  v_tenant_wallet      uuid;
  v_landlord_wallet    uuid;
  v_before             jsonb;
  v_label              text;
  v_new_status         text;
begin
  select id into v_escrow_wallet_id from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';
  select id into v_platform_wallet_id from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';
  if v_escrow_wallet_id is null or v_platform_wallet_id is null then
    raise exception 'SYSTEM_WALLET_MISSING';
  end if;

  select is_admin into v_is_admin from public.users where id = p_admin_id;
  if v_is_admin is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if not v_is_admin then raise exception 'not_admin' using errcode = '42501'; end if;

  if p_action not in ('refund', 'release', 'dispute') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;

  if p_action = 'dispute' then
    if v_booking.status <> 'paid' then
      raise exception 'invalid_status' using errcode = '22023';
    end if;
  else
    if v_booking.status not in ('paid', 'disputed') then
      raise exception 'invalid_status' using errcode = '22023';
    end if;
  end if;

  v_before := jsonb_build_object('status', v_booking.status);

  if p_action = 'refund' then
    select id into v_tenant_wallet from public.wallets
     where user_id = v_booking.tenant_id and currency = 'GNF';
    if v_tenant_wallet is null then
      insert into public.wallets (user_id, currency)
        values (v_booking.tenant_id, 'GNF')
        on conflict (user_id, currency) do update set updated_at = now()
        returning id into v_tenant_wallet;
    end if;

    perform public.post_transfer(v_escrow_wallet_id, v_tenant_wallet, v_booking.total_minor,
                                 'booking_refund', p_booking_id);

    -- A refunded monthly lease frees the property again (mirror of the
    -- 'reserved' flip in confirm_booking_payment).
    if v_booking.period = 'month' then
      update public.properties set status = 'active', updated_at = now()
       where id = v_booking.property_id and status = 'reserved';
    end if;

    v_new_status := 'refunded';
    v_label := 'Remboursement effectué par l''équipe Linky — loyer et frais recrédités au locataire';

  elsif p_action = 'release' then
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

    v_new_status := 'active';
    v_label := 'Loyer versé au propriétaire par l''équipe Linky';

  else -- dispute
    v_new_status := 'disputed';
    v_label := 'Réservation placée en litige par l''équipe Linky';
  end if;

  update public.bookings
     set status = v_new_status,
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(), 'label', v_label, 'admin_id', p_admin_id)),
         updated_at = now()
   where id = p_booking_id;

  insert into public.admin_actions (
    admin_id, target_type, target_id, action, reason, metadata,
    before_snapshot, after_snapshot
  ) values (
    p_admin_id,
    'booking',
    p_booking_id,
    'booking_' || p_action,
    p_reason,
    jsonb_build_object('amount_minor', v_booking.amount_minor,
                       'fees_minor', v_booking.fees_minor,
                       'total_minor', v_booking.total_minor,
                       'tenant_id', v_booking.tenant_id,
                       'landlord_id', v_booking.landlord_id),
    v_before,
    jsonb_build_object('status', v_new_status)
  );

  return v_new_status;
end;
$$;

revoke all on function public.admin_resolve_booking(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_booking(uuid, uuid, text, text) to service_role;
