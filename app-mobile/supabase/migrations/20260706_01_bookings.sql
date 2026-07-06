-- Bookings — the rental (location) tenant journey: request → landlord accepts &
-- signs → tenant signs & pays (per-booking escrow, card rail V1) → tenant
-- confirms move-in → escrow released to the landlord. Client requirement
-- 2026-07: "booking complet (parcours locataire jusqu'à la signature du
-- contrat)" for daily/monthly rentals; the visit stays OPTIONAL for rentals.
--
-- Deliberately its own table (NOT an orders row): orders hard-requires
-- product_id/shop_id/product_snapshot and its RPCs join products. A booking
-- references a property + a date period and has a two-party signature.
--
-- Money mirrors the order escrow model exactly:
--   payment success  → one-sided credit  ESCROW wallet   ref 'booking_escrow'
--   move-in confirm  → ESCROW → landlord (rent)          ref 'booking_release'
--                      ESCROW → platform (3% buyer fee)  ref 'booking_platform_fee'
-- Buyer pays the 3% on top; the landlord receives the full rent amount.
create table if not exists public.bookings (
  id                 uuid primary key default public.uuidv7(),
  property_id        uuid not null references public.properties(id) on delete cascade,
  tenant_id          uuid not null references public.users(id) on delete cascade,
  landlord_id        uuid not null references public.users(id) on delete cascade,
  -- Billing period, mirrors properties.per_month at request time.
  period             text not null check (period in ('day','month')),
  start_date         date not null,
  -- Daily stays: exclusive end date (check-out). Monthly leases: null.
  end_date           date,
  -- Monthly leases: agreed duration in months (contract info; months beyond
  -- the first are settled directly between the parties per the contract).
  months             int check (months is null or (months >= 1 and months <= 36)),
  -- Snapshot money (GNF integer): rent_minor = unit price at booking time;
  -- amount_minor = what the landlord receives (nights × rent, or 1st month);
  -- fees_minor = 3% buyer fee on top; total = amount + fees.
  rent_minor         bigint not null check (rent_minor > 0),
  amount_minor       bigint not null check (amount_minor > 0),
  fees_minor         bigint not null check (fees_minor >= 0),
  total_minor        bigint not null check (total_minor = amount_minor + fees_minor),
  currency           text not null default 'GNF' check (currency = 'GNF'),
  property_snapshot  jsonb not null,
  note               text not null default '' check (char_length(note) <= 500),
  -- Lifecycle. V1 writers: requested (booking-request) → accepted|rejected
  -- (booking-respond) ; cancelled (booking-cancel, pre-payment only) ;
  -- paid (confirm_booking_payment via stripe-webhook) ; active
  -- (release_booking via booking-checkin-confirm). disputed/refunded/completed
  -- are schema-ready for the dispute/end-of-stay pass (V1.1).
  status             text not null default 'requested'
                     check (status in ('requested','accepted','rejected','cancelled',
                                       'paid','active','completed','disputed','refunded')),
  -- The in-app contract: terms snapshot shown to BOTH parties before signing.
  contract           jsonb,
  landlord_signed_at timestamptz,
  tenant_signed_at   timestamptz,
  -- Card rail reference (Stripe PaymentIntent id, metadata.kind='booking').
  stripe_pi_id       text,
  events             jsonb not null default '[]',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Daily stays need a check-out strictly after check-in.
  check (period = 'month' or (end_date is not null and end_date > start_date))
);

create index if not exists bookings_property_idx on public.bookings (property_id, status);
create index if not exists bookings_tenant_idx   on public.bookings (tenant_id, created_at desc);
create index if not exists bookings_landlord_idx on public.bookings (landlord_id, created_at desc);

-- RLS on; service_role only (edge functions enforce auth + ownership).
alter table public.bookings enable row level security;

-- Notifications: allow the 'booking' category + ref_type. The originals are
-- inline CHECKs from 20260610_01 — drop & recreate with the new value.
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category in ('order', 'message', 'visit', 'promo', 'system', 'booking'));
alter table public.notifications drop constraint if exists notifications_ref_type_check;
alter table public.notifications add constraint notifications_ref_type_check
  check (ref_type in ('order', 'conversation', 'visit_request', 'booking'));

-- ============================================================================
-- confirm_booking_payment — called by stripe-webhook after amount/currency
-- verification (metadata.kind='booking'). One-sided escrow credit (funds came
-- from outside via the card rail), status accepted → paid, property → reserved.
-- Idempotent: a booking already past 'accepted' is a no-op ('noop').
-- ============================================================================
create or replace function public.confirm_booking_payment(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking      record;
  v_escrow_id    uuid := '00000000-0000-0000-0000-000000000001';
  v_escrow_bal   bigint;
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

  -- Serialize escrow ledger appends (same one-sided pattern as order rails).
  perform 1 from public.wallets where id = v_escrow_id for update;
  v_escrow_bal := coalesce((select balance_after from public.ledger_entries
                            where wallet_id = v_escrow_id
                            order by created_at desc, id desc limit 1), 0);
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values (v_escrow_id, 'credit', v_booking.total_minor, v_escrow_bal + v_booking.total_minor,
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
  -- bookable — the date-overlap guard is what protects daily conflicts
  -- (review: property would otherwise be stuck 'reserved' forever).
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
-- release_booking — tenant confirms move-in / key handover. Escrow → landlord
-- (full rent) + escrow → platform (3% buyer fee), status paid → active.
-- Creates the landlord's GNF wallet lazily. Caller identity is verified by the
-- edge function; the RPC re-asserts tenant + status under lock.
-- ============================================================================
create or replace function public.release_booking(p_booking_id uuid, p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking      record;
  v_escrow_id    uuid := '00000000-0000-0000-0000-000000000001';
  v_platform_id  uuid := '00000000-0000-0000-0000-000000000002';
  v_landlord_wallet uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.tenant_id <> p_tenant_id then raise exception 'FORBIDDEN'; end if;
  if v_booking.status <> 'paid' then raise exception 'INVALID_STATUS'; end if;

  select id into v_landlord_wallet from public.wallets
   where user_id = v_booking.landlord_id and currency = 'GNF';
  if v_landlord_wallet is null then
    insert into public.wallets (user_id, currency)
      values (v_booking.landlord_id, 'GNF')
      on conflict (user_id, currency) do update set updated_at = now()
      returning id into v_landlord_wallet;
  end if;

  perform public.post_transfer(v_escrow_id, v_landlord_wallet, v_booking.amount_minor,
                               'booking_release', p_booking_id);
  if v_booking.fees_minor > 0 then
    perform public.post_transfer(v_escrow_id, v_platform_id, v_booking.fees_minor,
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
