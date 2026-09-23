-- CORRECTIONS DE LA RELECTURE ADVERSARIALE DE LA PROLONGATION (2026-09-23).
-- 15 defauts confirmes sur 19 signales. Ceux qui vivent en SQL sont ici.

-- ============================================================================
-- 0. UNE SEULE DEFINITION DE « CE BIEN EST-IL ENCORE OCCUPE ? »
--
-- La condition etait recopiee a trois endroits et elle divergeait deja :
-- complete_ended_bookings verifiait qu'aucun bail exclusif ne restait, tandis
-- que cancel_paid_booking et admin_resolve_booking remettaient le bien en
-- vente SANS RIEN VERIFIER. Consequence : annuler une prolongation pendant que
-- le bail d'origine court remettait le logement au catalogue alors que son
-- locataire y habitait encore — les tiers etaient bien refuses plus loin, mais
-- l'annonce mentait, et le proprietaire voyait son bien occupe affiche libre.
--
-- 'accepted' compte comme occupant : entre l'acceptation par le bailleur et le
-- paiement, le creneau est promis. C'est borne — expire_stale_bookings balaie
-- les 'accepted' abandonnees apres 7 jours — et la passe de liberation
-- ci-dessous se rejoue chaque nuit, donc rien ne reste bloque indefiniment.
create or replace function public.property_is_occupied(p_property_id uuid, p_except uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.bookings b
     where b.property_id = p_property_id
       and (p_except is null or b.id <> p_except)
       and b.status in ('accepted', 'paid', 'active', 'disputed')
       and b.period in ('month', 'sale')
  );
$fn$;

revoke all on function public.property_is_occupied(uuid, uuid) from public, anon, authenticated;
grant execute on function public.property_is_occupied(uuid, uuid) to service_role;

-- ============================================================================
-- 1. LA CHAINE DE PROLONGATIONS, PAS LE SEUL PARENT DIRECT.
--
-- Un locataire qui prolonge deux fois porte trois reservations sur le bien :
-- le bail d'origine, la premiere prolongation, la seconde. N'excluer que le
-- parent DIRECT laissait le bail d'origine — toujours exclusif — refuser la
-- deuxieme prolongation : le locataire se voyait dire « ces dates ne sont plus
-- disponibles » sur le logement qu'il occupe. Et comme un bail reste 'paid'
-- pour toujours tant que l'emmenagement n'est pas confirme, le refus n'avait
-- aucune raison de cesser.
--
-- On remonte donc les liens extends_booking_id, et uniquement chez le MEME
-- locataire : la chaine ne doit jamais servir a contourner l'occupation d'un
-- tiers. `cycle` protege d'une boucle de liens corrompue.
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
-- 2. LA LIBERATION DU BIEN SE REJOUE CHAQUE NUIT AU LIEU D'ETRE A COUP UNIQUE.
--
-- REGRESSION INTRODUITE LA VEILLE (20260923_04). En ajoutant 'accepted' a la
-- condition de liberation, on a rendu possible ceci : le bail parent se termine
-- la nuit ou une prolongation est encore 'accepted' et impayee ; la liberation
-- est sautee ; sept jours plus tard expire_stale_bookings annule la
-- prolongation — mais elle n'ecrit QUE dans bookings. Le bail parent etant deja
-- 'completed', la boucle ne le retourne plus jamais, et la liberation n'est
-- jamais retentee. Le bien restait 'reserved' POUR TOUJOURS : disparu du
-- catalogue (list-properties ne sert que les 'active'), et booking-request
-- repondait PROPERTY_INACTIVE a tout le monde, y compris a l'ancien locataire.
--
-- La cause n'est pas le 'accepted' : c'est d'avoir lie la liberation a une
-- transition ponctuelle. On ajoute donc une passe finale, independante de la
-- boucle, qui rattrape chaque nuit tout bien 'reserved' que plus rien
-- n'occupe — y compris ceux bloques par d'autres chemins.
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
begin
  -- Sejours a la journee.
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

  -- Baux au mois.
  with done as (
    update public.bookings
       set status = 'completed',
           events = events || jsonb_build_array(jsonb_build_object(
             'at', now(), 'label', 'Bail terminé')),
           updated_at = now()
     where status = 'active'
       and period = 'month'
       and months is not null
       and (start_date + make_interval(months => months))::date < v_today
    returning id
  )
  select count(*) into v_n from done;
  v_count := v_count + v_n;

  -- PASSE DE RATTRAPAGE, rejouee chaque nuit et independante de ce qui precede :
  -- tout bien 'reserved' que plus aucune reservation exclusive n'occupe
  -- redevient disponible. Elle ne touche ni 'sold' ni les biens mis en pause.
  update public.properties p
     set status = 'active', updated_at = now()
   where p.status = 'reserved'
     and not public.property_is_occupied(p.id);

  return v_count;
end;
$fn$;

revoke all on function public.complete_ended_bookings() from public, anon, authenticated;
grant execute on function public.complete_ended_bookings() to service_role;

-- ============================================================================
-- 3. ANNULER UN BAIL QUI PORTE UNE PROLONGATION VIVANTE EST REFUSE.
--
-- Le trou : le locataire reserve un bail d'un mois, paie (loyer + caution en
-- sequestre), prolonge de douze mois — la prolongation est dispensee de caution
-- — puis annule le bail PARENT dans sa fenetre de 48 h et recupere TOUT, caution
-- comprise. Il reste titulaire d'un bail d'un an sans qu'aucun depot n'ait
-- jamais ete verse, alors que le contrat qu'il a signe affirme le contraire.
-- booking-request ne dispense desormais de caution que si le parent est 'active'
-- (l'argent est alors deja chez le proprietaire) ; ce garde-ci ferme l'autre
-- moitie du scenario, et empeche aussi de laisser une prolongation orpheline
-- rattachee a un bail rembourse.
--
-- La liberation du bien devient conditionnelle, ici comme cote administration.
create or replace function public.cancel_paid_booking(
  p_booking_id uuid,
  p_tenant_id  uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_booking        record;
  v_escrow_wallet  uuid;
  v_tenant_wallet  uuid;
  v_deadline       timestamptz;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.tenant_id <> p_tenant_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_booking.status <> 'paid' then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  if v_booking.period = 'sale' then
    raise exception 'NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.bookings e
     where e.extends_booking_id = p_booking_id
       and e.status in ('requested', 'accepted', 'paid', 'active', 'disputed')
  ) then
    raise exception 'HAS_LIVE_EXTENSION' using errcode = 'P0001';
  end if;

  v_deadline := (v_booking.start_date::timestamp at time zone 'Africa/Conakry')
                - interval '48 hours';
  if now() >= v_deadline then
    raise exception 'CANCEL_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  select id into v_escrow_wallet from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF'
     for update;
  if v_escrow_wallet is null then
    raise exception 'ESCROW_WALLET_MISSING' using errcode = 'P0001';
  end if;

  select id into v_tenant_wallet from public.wallets
   where user_id = v_booking.tenant_id and currency = 'GNF';
  if v_tenant_wallet is null then
    insert into public.wallets (user_id, currency)
      values (v_booking.tenant_id, 'GNF')
      on conflict (user_id, currency) do update set updated_at = now()
      returning id into v_tenant_wallet;
  end if;

  perform public.post_transfer(v_escrow_wallet, v_tenant_wallet, v_booking.total_minor,
                               'booking_refund', p_booking_id);

  update public.bookings
     set status = 'refunded',
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(),
           'label', 'Réservation annulée par le locataire — montant remboursé')),
         updated_at = now()
   where id = p_booking_id;

  -- Liberation CONDITIONNELLE : un autre bail peut encore tenir le logement.
  if v_booking.period = 'month' then
    update public.properties set status = 'active', updated_at = now()
     where id = v_booking.property_id
       and status = 'reserved'
       and not public.property_is_occupied(v_booking.property_id, p_booking_id);
  end if;

  return 'refunded';
end;
$fn$;

revoke all on function public.cancel_paid_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_paid_booking(uuid, uuid) to service_role;

-- ============================================================================
-- 4. MEME LIBERATION CONDITIONNELLE COTE ADMINISTRATION.
--
-- On ne BLOQUE pas le remboursement administratif quand une prolongation
-- existe, contrairement au chemin locataire : l'equipe doit pouvoir trancher un
-- litige quoi qu'il arrive, et une regle qui l'en empeche se contourne au
-- couteau en base. Seule la remise en vente du bien devient conditionnelle.
do $mig$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_resolve_booking';
  if v_src is null then
    raise exception 'admin_resolve_booking introuvable';
  end if;
  if position(
    'where id = v_booking.property_id and status = ''reserved'';' in v_src) = 0 then
    raise exception 'admin_resolve_booking : la liberation attendue est introuvable, migration a revoir';
  end if;
  v_src := replace(v_src,
    'where id = v_booking.property_id and status = ''reserved'';',
    'where id = v_booking.property_id and status = ''reserved''
         and not public.property_is_occupied(v_booking.property_id, p_booking_id);');
  execute v_src;
end
$mig$;

revoke all on function public.admin_resolve_booking(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_booking(uuid, uuid, text, text) to service_role;
