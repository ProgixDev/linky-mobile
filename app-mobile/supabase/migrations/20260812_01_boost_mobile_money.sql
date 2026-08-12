-- ============================================================================
-- Boost payable par Orange Money / MTN (rail Lengopay), en plus du portefeuille.
-- Client 2026-08-12 : « Donner la possibilité d'utiliser son wallet vendeur et
-- d'utiliser les méthodes de paiement (OM, MTN) ».
--
-- Jusqu'ici purchase_boost / purchase_property_boost debitaient le PORTEFEUILLE
-- vendeur, et rien d'autre. Un vendeur a 0 GNF ne pouvait pas booster : il
-- devait d'abord recharger. Ce chemin reste INTACT — il est atomique et il
-- marche. On ajoute un second chemin a cote, calque a l'identique sur celui des
-- reservations (20260729_05) : intention de paiement -> page Lengopay -> le cron
-- finalise.
--
-- Difference comptable entre les deux chemins, et c'est le coeur du sujet :
--   * portefeuille : transfert vendeur -> plateforme, DEUX ecritures, l'argent
--     etait deja dans notre grand livre.
--   * mobile money : l'argent arrive de l'exterieur, chez Lengopay. Le vendeur
--     n'est JAMAIS debite chez nous — le debiter serait le faire payer deux
--     fois. On credite donc la plateforme d'un seul cote, exactement comme
--     process_intent_outcome credite le sequestre pour une commande MoMo.
--
-- Un boost mobile money nait 'pending_payment' : il ne remonte PAS l'annonce et
-- n'apparait PAS dans l'historique tant qu'il n'est pas paye. Sinon il suffirait
-- d'ouvrir la page de paiement et de la fermer pour etre booste gratuitement.
--
-- Applique en prod (mkaddhcjneilvwqethjo) via l'editeur SQL — `db push` est
-- inutilisable sur ce projet (versions distantes desynchronisees des fichiers).
-- ============================================================================

-- ─── 1. payment_intents : troisieme cible possible ──────────────────────────
-- La contrainte etait binaire (commande XOR reservation) ; elle devient
-- ternaire. Les lignes existantes portent toutes order_id ou booking_id, elles
-- satisfont donc la nouvelle version sans reprise.
alter table public.payment_intents
  add column if not exists boost_id uuid references public.boosts(id) on delete cascade;
alter table public.payment_intents drop constraint if exists payment_intents_one_target;
alter table public.payment_intents
  add constraint payment_intents_one_target
  check (num_nonnulls(order_id, booking_id, boost_id) = 1);
create index if not exists payment_intents_boost_idx
  on public.payment_intents (boost_id) where boost_id is not null;

-- ─── 2. Cloisonner les balayeurs COMMANDE ───────────────────────────────────
-- Ils ne filtraient que `booking_id is null`. Une intention de boost (order_id
-- ET booking_id nuls) y tombait donc : pick_intents_to_poll l'aurait servie a
-- process_intent_outcome, qui exige une commande et leve ORDER_NOT_FOUND. Corps
-- inchanges par ailleurs — seul le filtre bouge.
create or replace function public.pick_intents_to_poll(p_limit integer default 200)
 returns setof public.payment_intents
 language sql security definer set search_path to ''
as $function$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.booking_id is null
    and pi.boost_id is null
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
      and boost_id is null
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

-- ─── 3. boosts : un statut d'attente de paiement ────────────────────────────
-- Le chemin portefeuille n'ecrit jamais ce statut : il reste atomique et naît
-- 'active'. Ce statut n'existe que pour le mobile money.
alter table public.boosts drop constraint if exists boosts_status_check;
alter table public.boosts
  add constraint boosts_status_check
  check (status in ('active','expired','cancelled','pending_payment'));

-- ─── 4. create_pending_boost — reserve, sans toucher a l'argent ─────────────
-- Memes gardes que purchase_boost / purchase_property_boost (propriete, annonce
-- active) : refuser AVANT d'envoyer le vendeur sur la page de paiement vaut
-- mieux que devoir le rembourser apres. Aucun mouvement de fonds ici.
--
-- ends_at n'est PAS calcule maintenant. Entre l'ouverture de la page Lengopay et
-- le paiement il peut s'ecouler plusieurs minutes, et l'annonce peut avoir ete
-- boostee entre-temps : l'empilement se calcule donc a la confirmation, sur la
-- valeur de boosted_until a cet instant. La valeur posee ici n'est qu'un
-- remplissage pour satisfaire NOT NULL.
create or replace function public.create_pending_boost(
  p_product_id   uuid,
  p_property_id  uuid,
  p_seller_id    uuid,
  p_days         int,
  p_amount_minor bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner    uuid;
  v_status   text;
  v_boost_id uuid;
begin
  if p_days <= 0 or p_amount_minor <= 0 then
    raise exception 'INVALID_INPUT';
  end if;
  if num_nonnulls(p_product_id, p_property_id) <> 1 then
    raise exception 'INVALID_INPUT';
  end if;

  if p_product_id is not null then
    select s.owner_id, p.status into v_owner, v_status
    from public.products p
    join public.shops s on s.id = p.shop_id
    where p.id = p_product_id
    for update of p;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if v_owner <> p_seller_id then raise exception 'NOT_OWNER'; end if;
    if v_status <> 'active' then raise exception 'PRODUCT_NOT_ACTIVE'; end if;
  else
    select pr.owner_id, pr.status into v_owner, v_status
    from public.properties pr
    where pr.id = p_property_id
    for update of pr;
    if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;
    if v_owner <> p_seller_id then raise exception 'NOT_OWNER'; end if;
    if v_status <> 'active' then raise exception 'PROPERTY_NOT_ACTIVE'; end if;
  end if;

  insert into public.boosts
    (product_id, property_id, seller_id, amount_minor, days, status, ref_id, starts_at, ends_at)
  values
    (p_product_id, p_property_id, p_seller_id, p_amount_minor, p_days, 'pending_payment',
     public.uuidv7(), now(), now() + make_interval(days => p_days))
  returning id into v_boost_id;

  return v_boost_id;
end;
$$;

-- ─── 5. confirm_boost_payment — l'argent est arrive, on active ──────────────
-- Idempotente : le cron peut rejouer (au pire deux tours de sondage tombent sur
-- le meme succes). Retourne 'confirmed' | 'noop' | 'unknown' pour que l'appelant
-- distingue « active » de « deja actif » de « introuvable » — meme convention
-- que confirm_booking_payment.
create or replace function public.confirm_boost_payment(p_boost_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_boost            public.boosts;
  v_boosted_until    timestamptz;
  v_platform_wallet  uuid;
  v_balance          bigint;
  v_ends_at          timestamptz;
begin
  select * into v_boost from public.boosts where id = p_boost_id for update;
  if not found then return 'unknown'; end if;
  if v_boost.status <> 'pending_payment' then return 'noop'; end if;

  -- Empilement : on prolonge a partir de la fin en cours si l'annonce est deja
  -- boostee, sinon a partir de maintenant. Identique a purchase_boost.
  if v_boost.product_id is not null then
    select boosted_until into v_boosted_until
      from public.products where id = v_boost.product_id for update;
  else
    select boosted_until into v_boosted_until
      from public.properties where id = v_boost.property_id for update;
  end if;

  v_ends_at := greatest(now(), coalesce(v_boosted_until, now()))
               + make_interval(days => v_boost.days);

  -- Ecriture a UN SEUL cote : le vendeur a paye chez Lengopay, hors de notre
  -- grand livre. Le debiter ici le ferait payer deux fois. Meme forme que le
  -- credit de sequestre de process_intent_outcome.
  select id into v_platform_wallet
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF'
    for update;
  if v_platform_wallet is null then raise exception 'PLATFORM_WALLET_NOT_FOUND'; end if;

  v_balance := coalesce(
    (select balance_after from public.ledger_entries
      where wallet_id = v_platform_wallet
      order by created_at desc, id desc limit 1), 0);

  insert into public.ledger_entries
    (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
  values
    (v_platform_wallet, 'credit', v_boost.amount_minor,
     v_balance + v_boost.amount_minor, 'boost_purchase', v_boost.ref_id);

  update public.boosts
     set status = 'active', starts_at = now(), ends_at = v_ends_at
   where id = p_boost_id;

  if v_boost.product_id is not null then
    update public.products set boosted = true, boosted_until = v_ends_at
     where id = v_boost.product_id;
  else
    update public.properties set boosted = true, boosted_until = v_ends_at
     where id = v_boost.property_id;
  end if;

  return 'confirmed';
end;
$$;

-- ─── 6. process_boost_intent_outcome — transition terminale ─────────────────
create or replace function public.process_boost_intent_outcome(
  p_intent_id uuid, p_terminal_status text, p_rail_status text,
  p_error_code text, p_error_message text)
returns void
language plpgsql security definer set search_path to ''
as $$
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
  if v_intent.boost_id is null then raise exception 'NOT_A_BOOST_INTENT'; end if;
  if v_intent.status <> 'pending' then
    raise notice 'process_boost_intent_outcome: intent % already %, skipping', p_intent_id, v_intent.status;
    return;
  end if;

  if p_terminal_status = 'completed' then
    v_result := public.confirm_boost_payment(v_intent.boost_id);
    if v_result = 'unknown' then
      raise warning 'process_boost_intent_outcome: boost % encaisse mais introuvable — remboursement manuel (intent %)',
        v_intent.boost_id, p_intent_id;
    end if;
  else
    -- Echec / annulation : le boost n'a jamais remonte l'annonce, rien a
    -- defaire cote argent. On ferme la ligne pour qu'elle ne traine pas en
    -- attente indefiniment.
    update public.boosts set status = 'cancelled'
     where id = v_intent.boost_id and status = 'pending_payment';
  end if;

  update public.payment_intents
    set status = p_terminal_status, rail_status = p_rail_status,
        last_error_code = p_error_code, last_error_message = p_error_message,
        completed_at = v_now, updated_at = v_now
    where id = p_intent_id;
end;
$$;

-- ─── 7. Sondage + expiration des intentions de boost ────────────────────────
create or replace function public.pick_boost_intents_to_poll(p_limit integer default 200)
 returns setof public.payment_intents
 language sql security definer set search_path to ''
as $function$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.boost_id is not null
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

-- Le vendeur a ouvert la page et ne l'a jamais payee : on expire l'intention ET
-- on annule le boost reserve, sinon il resterait 'pending_payment' pour
-- toujours. Aucun mouvement de fonds — il n'y en a jamais eu.
create or replace function public.expire_stale_boost_intents()
 returns integer
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_count  int := 0;
  v_intent record;
  v_now    timestamptz := now();
begin
  for v_intent in
    select id, boost_id from public.payment_intents
    where status = 'pending'
      and rail = 'lengopay'
      and boost_id is not null
      and created_at < v_now - interval '15 minutes'
      and (last_polled_at is null or last_error_code is null)
    for update skip locked
  loop
    update public.payment_intents
      set status = 'expired', completed_at = v_now, updated_at = v_now
      where id = v_intent.id;
    update public.boosts set status = 'cancelled'
      where id = v_intent.boost_id and status = 'pending_payment';
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

-- ─── 8. Verrouillage (durcissement 2026-07-29) ──────────────────────────────
-- Supabase re-accorde EXECUTE a anon/authenticated sur toute nouvelle fonction
-- SECURITY DEFINER : il faut le retirer a chaque fois. Le cron et les fonctions
-- edge passent par service_role.
revoke all on function public.create_pending_boost(uuid, uuid, uuid, int, bigint) from public, anon, authenticated;
grant execute on function public.create_pending_boost(uuid, uuid, uuid, int, bigint) to service_role;
revoke all on function public.confirm_boost_payment(uuid) from public, anon, authenticated;
grant execute on function public.confirm_boost_payment(uuid) to service_role;
revoke all on function public.process_boost_intent_outcome(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.process_boost_intent_outcome(uuid, text, text, text, text) to service_role;
revoke all on function public.pick_boost_intents_to_poll(integer) from public, anon, authenticated;
grant execute on function public.pick_boost_intents_to_poll(integer) to service_role;
revoke all on function public.expire_stale_boost_intents() from public, anon, authenticated;
grant execute on function public.expire_stale_boost_intents() to service_role;
revoke all on function public.pick_intents_to_poll(integer) from public, anon, authenticated;
grant execute on function public.pick_intents_to_poll(integer) to service_role;
revoke all on function public.expire_stale_intents() from public, anon, authenticated;
grant execute on function public.expire_stale_intents() to service_role;
