-- ============================================================================
-- Achat en ligne pour les biens en VENTE et TERRAIN, pas seulement la
-- location. Demande client directe (31/08) : « Tu peux activer le paiement
-- pour la vente immo et Terrain aussi pas uniquement la location ».
--
-- Reutilise deliberement la table/le sequestre/le litige des reservations :
-- meme modele de confiance (l'acheteur confirme, l'argent part alors seulement,
-- litige humain arbitre en cas de desaccord) deja en place partout ailleurs
-- dans l'app — pas de suivi notarial cote serveur, comme pour tout le reste.
-- Ce qui change : pas de dates, pas de periode recurrente, le prix plein payé
-- une seule fois, et — nouveau — la regle « visite obligatoire avant achat »
-- (raison d'etre deja ecrite dans visit-complete/index.ts le 2026-07, jamais
-- reellement appliquee nulle part jusqu'ici) est enfin verifiee, dans
-- booking-request cote TypeScript.
--
-- rent_minor garde son nom d'epoque locative mais porte aussi, pour une
-- reservation 'sale', le prix de vente au moment de la demande — pas de quoi
-- justifier un renommage de colonne pour un champ que tout lecteur traite deja
-- comme « prix unitaire au moment de la demande ».
--
-- Applique en prod (mkaddhcjneilvwqethjo) via l'editeur SQL.
-- ============================================================================

-- Both check constraints touching 'period' were declared INLINE in the
-- original CREATE TABLE (20260706_01), with no explicit name — Postgres
-- auto-generates one, and guessing it wrong here would silently leave the OLD
-- constraint (which rejects 'sale') still enforced alongside a new one.
-- Finding them by which column they reference is exact, not a guess.
do $$
declare
  r record;
begin
  for r in
    select distinct tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'bookings'
      and tc.constraint_type = 'CHECK'
      and ccu.column_name = 'period'
  loop
    execute format('alter table public.bookings drop constraint %I', r.constraint_name);
  end loop;
end $$;

alter table public.bookings add constraint bookings_period_check
  check (period in ('day','month','sale'));

alter table public.bookings add constraint bookings_end_date_check
  check (period in ('month','sale') or (end_date is not null and end_date > start_date));

-- ============================================================================
-- confirm_booking_payment — une vente marque le bien 'sold' (definitif),
-- distinct de 'reserved' (qui pour un bail garde le sens « occupe mais reste
-- la meme annonce »). Le garde-fou anti-conflit (review DEFECT-1, 2026-07-06)
-- traite maintenant 'sale' comme exclusif, au meme titre que 'month'.
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

  if exists (
    select 1 from public.bookings b
    where b.property_id = v_booking.property_id
      and b.id <> p_booking_id
      and b.status in ('paid', 'active')
      and (b.period in ('month','sale') or v_booking.period in ('month','sale')
           or (b.start_date < v_booking.end_date and v_booking.start_date < b.end_date))
  ) then
    return 'conflict';
  end if;

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

  if v_booking.period = 'month' then
    update public.properties set status = 'reserved', updated_at = now()
     where id = v_booking.property_id and status = 'active';
  elsif v_booking.period = 'sale' then
    update public.properties set status = 'sold', updated_at = now()
     where id = v_booking.property_id and status = 'active';
  end if;

  return 'confirmed';
end;
$$;

revoke all on function public.confirm_booking_payment(uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking_payment(uuid) to service_role;

-- ============================================================================
-- release_booking — libelle d'evenement adapte selon la periode : une vente
-- n'a pas d'« emmenagement », elle a une remise du bien. Comportement
-- (transfert + frais) inchange.
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
           'at', now(), 'label',
           case when v_booking.period = 'sale'
                then 'Remise du bien confirmée — montant versé au vendeur'
                else 'Emménagement confirmé — loyer versé au propriétaire'
           end)),
         updated_at = now()
   where id = p_booking_id;

  return 'released';
end;
$$;

revoke all on function public.release_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_booking(uuid, uuid) to service_role;
