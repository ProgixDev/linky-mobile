-- PAYER UNE RESERVATION AVEC LE PORTEFEUILLE LINKY.
--
-- Demande du client, 2026-09-24, capture de l'ecran de paiement a l'appui :
-- « Dans Réservation, au niveau du paiement le wallet n'apparaît pas. On peut
-- le rajouter stp ».
--
-- POURQUOI IL N'Y ETAIT PAS, ET CE N'ETAIT PAS UN OUBLI. L'ecran le disait en
-- toutes lettres (app/bookings/[id].tsx) : « le portefeuille n'est PAS propose
-- ici : confirm_booking_payment fait un credit a sens unique vers le sequestre
-- (l'argent vient du rail), donc s'en servir pour un paiement portefeuille
-- creerait de la monnaie ». C'est exact. Quand Orange Money encaisse, l'argent
-- entre dans le systeme par le rail : le sequestre est credite sans que rien ne
-- soit debite en face, comme une recharge. Brancher le portefeuille sur ce
-- meme chemin aurait credite le sequestre SANS debiter le locataire — un
-- paiement gratuit, et un grand livre faux.
--
-- CE QUE FONT DEJA LES COMMANDES. place_order (20260730_01:97) a la bonne
-- forme : pour le portefeuille, un `post_transfer(acheteur -> sequestre)`, donc
-- une vraie ecriture en partie double qui debite le payeur et refuse quand le
-- solde est insuffisant. Les reservations n'avaient simplement jamais eu leur
-- equivalent. Le voici.
--
-- LE RESTE EST IDENTIQUE A confirm_booking_payment : meme garde de conflit,
-- meme passage en 'paid', meme signature du locataire, meme mise en 'reserved'
-- ou 'sold' du bien. Seule l'origine de l'argent change.

-- ============================================================================
-- 1. LA GARDE DE CONFLIT, EXTRAITE — une seule definition pour deux appelants.
--
-- Elle existait dans confirm_booking_payment. La recopier dans la fonction
-- portefeuille aurait cree deux versions d'une regle qui doit rester unique :
-- c'est exactement ainsi que la condition de liberation d'un bien avait fini
-- par diverger a trois endroits (corrige le 2026-09-23 par property_is_occupied).
--
-- Elle repond : « une AUTRE reservation occupe-t-elle ce bien sur ce creneau ? »
-- La chaine de prolongations du meme locataire n'en fait jamais partie.
create or replace function public.booking_has_conflict(p_booking_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_booking record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then return false; end if;

  return exists (
    with recursive lineage as (
      select b.id, b.extends_booking_id
        from public.bookings b
       where b.id = v_booking.extends_booking_id
         and b.tenant_id = v_booking.tenant_id
         and b.property_id = v_booking.property_id
      union
      select b2.id, b2.extends_booking_id
        from public.bookings b2
        join lineage l on b2.id = l.extends_booking_id
       where b2.tenant_id = v_booking.tenant_id
         and b2.property_id = v_booking.property_id
    ) cycle id set is_cycle using path
    select 1 from public.bookings b
    where b.property_id = v_booking.property_id
      and b.id <> p_booking_id
      and b.id not in (select id from lineage)
      and b.status in ('paid', 'active', 'disputed')
      and (b.period in ('month','sale') or v_booking.period in ('month','sale')
           or (b.start_date < v_booking.end_date and v_booking.start_date < b.end_date))
  );
end;
$fn$;

revoke all on function public.booking_has_conflict(uuid) from public, anon, authenticated;
grant execute on function public.booking_has_conflict(uuid) to service_role;

-- ============================================================================
-- 2. confirm_booking_payment appelle la garde extraite. Aucun changement de
--    comportement : c'est le meme predicat, a un seul endroit desormais.
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

  if public.booking_has_conflict(p_booking_id) then
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

  -- Credit a SENS UNIQUE, volontairement : l'argent vient du rail de paiement,
  -- pas d'un autre portefeuille. C'est ce qui interdit d'emprunter ce chemin
  -- pour un paiement portefeuille — voir pay_booking_from_wallet plus bas.
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
-- 3. LE PAIEMENT PAR PORTEFEUILLE : un VRAI virement, pas un credit.
--
-- post_transfer verrouille les deux portefeuilles, derive le solde de la somme
-- des ecritures et leve INSUFFICIENT_FUNDS si le locataire n'a pas de quoi
-- payer. C'est lui qui garantit qu'aucune monnaie n'est creee ici.
--
-- Le ref_type reste 'booking_escrow' : du point de vue du grand livre, c'est le
-- meme evenement — de l'argent entre en sequestre pour cette reservation. La
-- liberation (release_booking) et le remboursement (cancel_paid_booking) n'ont
-- donc rien a savoir de l'origine des fonds, et continuent de fonctionner tels
-- quels. Seule difference visible : il existe une ligne de DEBIT en face.
create or replace function public.pay_booking_from_wallet(
  p_booking_id uuid,
  p_tenant_id  uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_booking       record;
  v_tenant_wallet uuid;
  v_escrow_wallet uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.tenant_id <> p_tenant_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_booking.status in ('paid', 'active', 'completed') then
    raise exception 'ALREADY_PAID' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'accepted' then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  if public.booking_has_conflict(p_booking_id) then
    raise exception 'BOOKING_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.wallets (user_id, currency)
    values (p_tenant_id, 'GNF')
    on conflict (user_id, currency) do nothing;
  select id into v_tenant_wallet from public.wallets
   where user_id = p_tenant_id and currency = 'GNF';

  select id into v_escrow_wallet from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';
  if v_escrow_wallet is null then
    raise exception 'ESCROW_WALLET_MISSING' using errcode = 'P0001';
  end if;

  -- Leve INSUFFICIENT_FUNDS si le solde ne couvre pas le total.
  perform public.post_transfer(v_tenant_wallet, v_escrow_wallet, v_booking.total_minor,
                               'booking_escrow', p_booking_id);

  update public.bookings
     set status = 'paid',
         tenant_signed_at = coalesce(tenant_signed_at, now()),
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(), 'label', 'Contrat signé — payé avec le portefeuille Linky')),
         updated_at = now()
   where id = p_booking_id;

  if v_booking.period = 'month' then
    update public.properties set status = 'reserved', updated_at = now()
     where id = v_booking.property_id and status = 'active';
  elsif v_booking.period = 'sale' then
    update public.properties set status = 'sold', updated_at = now()
     where id = v_booking.property_id and status = 'active';
  end if;

  return 'paid';
end;
$fn$;

revoke all on function public.pay_booking_from_wallet(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pay_booking_from_wallet(uuid, uuid) to service_role;
