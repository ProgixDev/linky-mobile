-- ════════════════════════════════════════════════════════════════════════
--  FENÊTRE DE PAIEMENT : 15 → 20 MINUTES
--
--  POURQUOI
--  Lengopay nous l'a confirmé par écrit le 2026-10-15 (Ibrahim Diallo) :
--  « La durée max d'une transaction est de 15min ». Notre fenêtre valait
--  15 minutes AUSSI. Résultat mesuré sur 88 transactions : notre dernier
--  sondage tombe à ~14 min 30, leur verdict à 15 min 00. On raccrochait
--  trente secondes avant la réponse, 88 fois de suite — d'où 88 intentions
--  mortes en 'expired' alors que leur statut réel ne nous est jamais parvenu.
--
--  Ce changement ne fera PAS aboutir un paiement de plus : si l'acheteur n'a
--  pas confirmé, il n'a pas confirmé. Il fait deux choses :
--    1. on recevra enfin le vrai verdict ('failed' au lieu d'un 'expired' de
--       notre propre montre) — on saura POURQUOI ça échoue ;
--    2. il supprime une course réelle : aujourd'hui un paiement confirmé à
--       15 min 01 arrive APRÈS qu'on a annulé la commande. L'acheteur paie,
--       la commande est annulée.
--
--  ⚠ LES SONDEURS COMPTENT AUTANT QUE LES EXPIRATIONS.
--  Élargir la seule expiration créerait une zone morte de 15 à 20 min :
--  l'intention vivante, mais n'appartenant plus à aucun palier de cadence,
--  donc plus jamais interrogée. Les deux occurrences de chaque sondeur
--  (la borne extérieure ET le dernier palier) bougent ensemble.
--
--  ⚠ CORPS RELEVÉS EN PRODUCTION le 2026-10-15 via pg_get_functiondef, PAS
--  recopiés du dépôt : les fichiers ont dérivé (confirm_booking_payment
--  appelle booking_has_conflict() en prod là où le dépôt porte encore un
--  `exists` en ligne). Seul l'intervalle change ici.
--
--  NON TOUCHÉES, volontairement : expire_stale_bookings et
--  expire_stale_escrows — cycles de vie des réservations et du séquestre,
--  sans rapport avec la fenêtre de paiement.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. LES QUATRE SONDEURS (2 occurrences chacun) ────────────────────────

CREATE OR REPLACE FUNCTION public.pick_intents_to_poll(p_limit integer DEFAULT 200)
 RETURNS SETOF payment_intents
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.rail_intent_id not like 'pending-init-%'
    and pi.booking_id is null
    and pi.boost_id is null
    and pi.batch_id is null
    and pi.created_at > now() - interval '20 minutes'
    and (
      (pi.created_at > now() - interval '60 seconds'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '5 seconds'))
      or
      (pi.created_at <= now() - interval '60 seconds'
        and pi.created_at > now() - interval '5 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '15 seconds'))
      or
      (pi.created_at <= now() - interval '5 minutes'
        and pi.created_at > now() - interval '20 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '30 seconds'))
    )
  order by pi.created_at
  limit p_limit
  for update skip locked;
$function$;

CREATE OR REPLACE FUNCTION public.pick_booking_intents_to_poll(p_limit integer DEFAULT 200)
 RETURNS SETOF payment_intents
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.rail_intent_id not like 'pending-init-%'
    and pi.booking_id is not null
    and pi.created_at > now() - interval '20 minutes'
    and (
      (pi.created_at > now() - interval '60 seconds'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '5 seconds'))
      or
      (pi.created_at <= now() - interval '60 seconds'
        and pi.created_at > now() - interval '5 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '15 seconds'))
      or
      (pi.created_at <= now() - interval '5 minutes'
        and pi.created_at > now() - interval '20 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '30 seconds'))
    )
  order by pi.created_at
  limit p_limit
  for update skip locked;
$function$;

CREATE OR REPLACE FUNCTION public.pick_boost_intents_to_poll(p_limit integer DEFAULT 200)
 RETURNS SETOF payment_intents
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.rail_intent_id not like 'pending-init-%'
    and pi.boost_id is not null
    and pi.created_at > now() - interval '20 minutes'
    and (
      (pi.created_at > now() - interval '60 seconds'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '5 seconds'))
      or
      (pi.created_at <= now() - interval '60 seconds'
        and pi.created_at > now() - interval '5 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '15 seconds'))
      or
      (pi.created_at <= now() - interval '5 minutes'
        and pi.created_at > now() - interval '20 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '30 seconds'))
    )
  order by pi.created_at
  limit p_limit
  for update skip locked;
$function$;

CREATE OR REPLACE FUNCTION public.pick_batch_intents_to_poll(p_limit integer DEFAULT 200)
 RETURNS SETOF payment_intents
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.rail_intent_id not like 'pending-init-%'
    and pi.batch_id is not null
    and pi.created_at > now() - interval '20 minutes'
    and (
      (pi.created_at > now() - interval '60 seconds'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '5 seconds'))
      or
      (pi.created_at <= now() - interval '60 seconds'
        and pi.created_at > now() - interval '5 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '15 seconds'))
      or
      (pi.created_at <= now() - interval '5 minutes'
        and pi.created_at > now() - interval '20 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '30 seconds'))
    )
  order by pi.created_at
  limit p_limit
  for update skip locked;
$function$;

-- ── 2. LES QUATRE EXPIRATIONS (1 occurrence chacune) ─────────────────────

CREATE OR REPLACE FUNCTION public.expire_stale_intents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and batch_id is null
      and created_at < v_now - interval '20 minutes'
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

CREATE OR REPLACE FUNCTION public.expire_stale_booking_intents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count int := 0; v_now timestamptz := now();
begin
  update public.payment_intents
    set status = 'expired', completed_at = v_now, updated_at = v_now
    where status = 'pending' and rail = 'lengopay' and booking_id is not null
      and created_at < v_now - interval '20 minutes'
      and (last_polled_at is null or last_error_code is null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.expire_stale_boost_intents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and created_at < v_now - interval '20 minutes'
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

CREATE OR REPLACE FUNCTION public.expire_stale_batch_intents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count  int := 0;
  v_intent record;
  v_now    timestamptz := now();
begin
  for v_intent in
    select id, batch_id from public.payment_intents
    where status = 'pending'
      and rail = 'lengopay'
      and batch_id is not null
      and created_at < v_now - interval '20 minutes'
      and (last_polled_at is null or last_error_code is null)
    for update skip locked
  loop
    update public.payment_intents
      set status = 'expired', completed_at = v_now, updated_at = v_now
      where id = v_intent.id;
    -- Aucun mouvement de fonds : rien n'a ete encaisse, les commandes du lot
    -- sont simplement annulees.
    update public.orders
      set status = 'cancelled',
          events = events || jsonb_build_array(
                     jsonb_build_object('at', v_now, 'label', 'Paiement expiré')),
          updated_at = v_now
      where batch_id = v_intent.batch_id and status = 'placed';
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

-- ── 3. RE-VERROUILLAGE ───────────────────────────────────────────────────
-- CREATE OR REPLACE conserve les privilèges, mais on ré-affirme la posture
-- du durcissement du 2026-07-29 : ces fonctions sont appelées par le cron,
-- jamais par l'application.
revoke all on function public.pick_intents_to_poll(integer)          from public, anon, authenticated;
revoke all on function public.pick_booking_intents_to_poll(integer)  from public, anon, authenticated;
revoke all on function public.pick_boost_intents_to_poll(integer)    from public, anon, authenticated;
revoke all on function public.pick_batch_intents_to_poll(integer)    from public, anon, authenticated;
revoke all on function public.expire_stale_intents()                 from public, anon, authenticated;
revoke all on function public.expire_stale_booking_intents()         from public, anon, authenticated;
revoke all on function public.expire_stale_boost_intents()           from public, anon, authenticated;
revoke all on function public.expire_stale_batch_intents()           from public, anon, authenticated;

grant execute on function public.pick_intents_to_poll(integer)         to service_role;
grant execute on function public.pick_booking_intents_to_poll(integer) to service_role;
grant execute on function public.pick_boost_intents_to_poll(integer)   to service_role;
grant execute on function public.pick_batch_intents_to_poll(integer)   to service_role;
grant execute on function public.expire_stale_intents()                to service_role;
grant execute on function public.expire_stale_booking_intents()        to service_role;
grant execute on function public.expire_stale_boost_intents()          to service_role;
grant execute on function public.expire_stale_batch_intents()          to service_role;

commit;
