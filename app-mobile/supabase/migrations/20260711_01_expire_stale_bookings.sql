-- Auto-expire stale, money-free bookings (2026-07-11). Before this, a
-- 'requested' booking a landlord never answered — or an 'accepted' one the
-- tenant never paid — hung in the tenant's list forever. Mirrors the
-- expire_boosts() pure-SQL + pg_cron pattern; no money is ever involved (both
-- targeted states are pre-escrow, and 'accepted' is only swept when its
-- stripe_pi_id is null → the 24h PI sweep owns accepted-with-a-charge).
--
-- TTL = 7 days. Both transitions land on 'cancelled' (the request lapsed; it
-- was not actively rejected).
create or replace function public.expire_stale_bookings()
returns void
language sql
security definer
set search_path = ''
as $$
  -- Requests the landlord never answered.
  update public.bookings
     set status = 'cancelled',
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(), 'label', 'Demande expirée — sans réponse sous 7 jours')),
         updated_at = now()
   where status = 'requested'
     and created_at < now() - interval '7 days';

  -- Accepted-but-never-paid (tenant didn't sign/pay). Money-in-flight is
  -- excluded: an accepted booking with a captured charge has a non-null
  -- stripe_pi_id and is settled by confirm_booking_payment / the PI sweep.
  update public.bookings
     set status = 'cancelled',
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(), 'label', 'Réservation expirée — paiement non finalisé sous 7 jours')),
         updated_at = now()
   where status = 'accepted'
     and stripe_pi_id is null
     and updated_at < now() - interval '7 days';
$$;
revoke all on function public.expire_stale_bookings() from public, anon, authenticated;
grant execute on function public.expire_stale_bookings() to service_role;

-- pg_cron already installed (20260528_04). Daily at 03:23.
do $$
begin
  perform cron.unschedule('linky-expire-bookings');
exception
  when others then null;
end $$;
select cron.schedule(
  'linky-expire-bookings',
  '23 3 * * *',
  $$ select public.expire_stale_bookings(); $$
);
