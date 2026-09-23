-- PROLONGER UN BAIL AU MOIS.
--
-- Demande du client, 2026-09-18 : « Quand le statut de la réservation est en
-- "Actives", rajouter un bouton "Prolonger" qui renvoie vers le calendrier de
-- réservation. » Le bouton a été livré le 2026-09-18 (commit 3026783) mais
-- UNIQUEMENT pour les locations a la journee : cote mensuel, il aurait mene a
-- un 409. Ce qui suit ouvre le chemin mensuel, que le client n'avait pas
-- distingue dans sa demande.
--
-- POURQUOI C'ETAIT BLOQUE, ET A TROIS ENDROITS. Un bail au mois payé passe le
-- bien en 'reserved' (confirm_booking_payment), et toute la machine d'occupation
-- est construite sur « un bail au mois bloque tout » :
--   1. booking-request refuse d'emblee un bien dont le status n'est pas
--      'active', puis refuse tout chevauchement exclusif ;
--   2. booking-respond refait ce contrôle a l'acceptation par le bailleur ;
--   3. confirm_booking_payment le refait une troisieme fois au paiement.
-- Ces trois gardes sont justes — elles empechent deux locataires de payer le
-- meme logement. Le seul cas qu'elles ne devraient PAS bloquer est celui du
-- locataire EN PLACE qui prolonge SON bail, a la suite immediate de celui-ci.
--
-- ON MATERIALISE DONC LE LIEN, plutot que de le deviner. Une prolongation
-- porte l'identifiant du bail qu'elle prolonge. Chacune des trois gardes exclut
-- alors exactement une ligne — le bail parent — et continue de bloquer tout le
-- reste. Deviner (« meme locataire, meme bien, dates qui s'enchainent ») aurait
-- marche au debut et se serait effrite des la premiere exception.
--
-- `on delete set null` : si le bail parent disparait un jour, la prolongation
-- reste une reservation valide a part entiere. Elle ne doit pas etre emportee.
alter table public.bookings
  add column if not exists extends_booking_id uuid references public.bookings(id) on delete set null;

comment on column public.bookings.extends_booking_id is
  'Bail au mois que cette reservation prolonge. Les gardes d''occupation (booking-request, booking-respond, confirm_booking_payment) excluent ce bail-la, et lui seul.';

-- Retrouver les prolongations d'un bail sans balayer la table.
create index if not exists bookings_extends_idx
  on public.bookings (extends_booking_id) where extends_booking_id is not null;

-- ============================================================================
-- La troisieme garde : au paiement. Identique a la version du 2026-09-23
-- (20260923_03) au `b.id <> v_booking.extends_booking_id` pres.
create or replace function public.confirm_booking_payment(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_booking       record;
  v_escrow_wallet uuid;
  v_escrow_bal    bigint;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then return 'unknown'; end if;
  if v_booking.status in ('paid', 'active', 'completed') then return 'noop_paid'; end if;
  if v_booking.status <> 'accepted' then return 'noop_dead'; end if;

  if exists (
    select 1 from public.bookings b
    where b.property_id = v_booking.property_id
      and b.id <> p_booking_id
      -- Le bail que l'on prolonge n'est pas un conflit : c'est le meme
      -- locataire, et la prolongation commence ou il s'arrete.
      and (v_booking.extends_booking_id is null or b.id <> v_booking.extends_booking_id)
      and b.status in ('paid', 'active', 'disputed')
      and (b.period in ('month','sale') or v_booking.period in ('month','sale')
           or (b.start_date < v_booking.end_date and v_booking.start_date < b.end_date))
  ) then
    return 'conflict';
  end if;

  select id into v_escrow_wallet
    from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF'
     for update;
  if v_escrow_wallet is null then
    raise exception 'ESCROW_WALLET_MISSING' using errcode = 'P0001';
  end if;

  -- La somme, pas le dernier balance_after (cf. 20260923_03).
  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
    into v_escrow_bal from public.ledger_entries where wallet_id = v_escrow_wallet;

  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values (v_escrow_wallet, 'credit', v_booking.total_minor,
            v_escrow_bal + v_booking.total_minor, 'booking_escrow', p_booking_id);

  update public.bookings
     set status = 'paid',
         tenant_signed_at = coalesce(tenant_signed_at, now()),
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(), 'label', 'Contrat signé — paiement reçu en séquestre')),
         updated_at = now()
   where id = p_booking_id;

  if v_booking.period = 'month' then
    update public.properties set status = 'reserved', updated_at = now()
     where id = v_booking.property_id and status = 'active';
  elsif v_booking.period = 'sale' then
    update public.properties set status = 'sold', updated_at = now()
     where id = v_booking.property_id and status = 'active';
  end if;

  return 'confirmed';
end;
$fn$;

revoke all on function public.confirm_booking_payment(uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking_payment(uuid) to service_role;

-- ============================================================================
-- LA FIN DU BAIL PARENT NE DOIT PAS LIBERER LE BIEN si une prolongation prend
-- la suite. complete_ended_bookings (20260916_02) verifiait deja qu'aucune
-- autre reservation exclusive 'paid'/'active' n'occupe le bien avant de le
-- remettre 'active' — une prolongation payee tombe dans ce filet. Mais une
-- prolongation encore 'accepted' (acceptee, pas encore payee) n'y tombe PAS :
-- le bien redeviendrait disponible, un tiers pourrait reserver, et le locataire
-- en place se ferait refuser son propre paiement. On ajoute donc 'accepted'
-- a la seule condition de LIBERATION — jamais aux gardes d'occupation, ou une
-- demande acceptee et abandonnee bloquerait le bien pour toujours.
create or replace function public.complete_ended_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_count integer := 0;
  v_n     integer;
  r       record;
begin
  with done as (
    update public.bookings
       set status = 'completed',
           events = events || jsonb_build_array(jsonb_build_object(
             'at', now(), 'label', 'Séjour terminé')),
           updated_at = now()
     where status = 'active'
       and period = 'day'
       and end_date is not null
       and end_date < v_today
    returning id
  )
  select count(*) into v_n from done;
  v_count := v_count + v_n;

  for r in
    update public.bookings
       set status = 'completed',
           events = events || jsonb_build_array(jsonb_build_object(
             'at', now(), 'label', 'Bail terminé')),
           updated_at = now()
     where status = 'active'
       and period = 'month'
       and months is not null
       and (start_date + make_interval(months => months))::date < v_today
    returning property_id
  loop
    v_count := v_count + 1;
    update public.properties p
       set status = 'active', updated_at = now()
     where p.id = r.property_id
       and p.status = 'reserved'
       and not exists (
         select 1 from public.bookings b
          where b.property_id = r.property_id
            and b.status in ('accepted', 'paid', 'active')
            and b.period in ('month', 'sale'));
  end loop;

  return v_count;
end;
$fn$;

revoke all on function public.complete_ended_bookings() from public, anon, authenticated;
grant execute on function public.complete_ended_bookings() to service_role;
