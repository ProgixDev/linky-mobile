-- Trouve en analysant les tests reels d'Abdoulaye ce matin (2026-09-07) :
-- les quatre selecteurs de sondage peuvent choisir une intention dont
-- rail_intent_id est ENCORE le placeholder 'pending-init-<uuid>' (S2 etape 1),
-- pas le vrai pay_id Lengopay.
--
-- Le trou : place-order (et ses cousins) INSERT la ligne avec le placeholder,
-- status='pending', PUIS appellent Lengopay, PUIS ecrivent le vrai pay_id (ou
-- ferment l'intention si le rail est mort). Entre les deux, la ligne est
-- selectionnable : les quatre fonctions ci-dessous ne filtrent que sur
-- status='pending' et rail='lengopay', jamais sur le contenu de
-- rail_intent_id. Si le tick de pg_cron (toutes les 5 s) tombe dans cette
-- fenetre, il envoie le PLACEHOLDER a Lengopay comme s'il s'agissait d'un vrai
-- pay_id.
--
-- Preuve en prod, ce matin : cron-poll-intents a authentiquement recu
-- « Lengopay v2 status 402: Pay ID not found » pour deux intentions dont la
-- base montre encore rail_intent_id='pending-init-...' — exactement le
-- placeholder envoye tel quel au rail.
--
-- CONSEQUENCE REELLE (pas seulement cosmetique) : ce sondage rate est traite
-- comme une panne passagere (RAIL_TRANSIENT), qui pose last_error_code. Or
-- expire_stale_intents (et ses trois cousins) refusent d'expirer une
-- intention dont le DERNIER sondage a echoue — c'est volontaire, on ne sait
-- pas si l'acheteur a paye entre-temps. Si CE sondage-la est le tout premier
-- d'une intention par ailleurs saine (Orange, MTN, Kulu, Soutra en train de
-- reussir normalement), elle devient INEXPIRABLE : plus jamais sondee (trop
-- vieille), plus jamais fermee. La commande reste 'placed' pour toujours, en
-- retenant son stock — le meme trou que le readback en echec, par un chemin
-- different.
--
-- Le sondeur des PaymentIntents Stripe evitait deja ce piege pour son propre
-- placeholder (voir pick_stale_stripe_intents, `rail_intent_id NOT LIKE
-- 'pending-init-%'`) — cette migration applique la meme garde aux quatre
-- selecteurs Lengopay, qui ne l'avaient jamais eue.

create or replace function public.pick_intents_to_poll(p_limit integer default 200)
returns setof public.payment_intents
language sql
security definer
set search_path to ''
as $$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.rail_intent_id not like 'pending-init-%'
    and pi.booking_id is null
    and pi.boost_id is null
    and pi.batch_id is null
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
$$;

create or replace function public.pick_batch_intents_to_poll(p_limit integer default 200)
returns setof public.payment_intents
language sql
security definer
set search_path to ''
as $$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.rail_intent_id not like 'pending-init-%'
    and pi.batch_id is not null
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
$$;

create or replace function public.pick_booking_intents_to_poll(p_limit integer default 200)
returns setof public.payment_intents
language sql
security definer
set search_path to ''
as $$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.rail_intent_id not like 'pending-init-%'
    and pi.booking_id is not null
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
$$;

create or replace function public.pick_boost_intents_to_poll(p_limit integer default 200)
returns setof public.payment_intents
language sql
security definer
set search_path to ''
as $$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.rail_intent_id not like 'pending-init-%'
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
$$;

revoke all on function public.pick_intents_to_poll(integer) from public, anon, authenticated;
revoke all on function public.pick_batch_intents_to_poll(integer) from public, anon, authenticated;
revoke all on function public.pick_booking_intents_to_poll(integer) from public, anon, authenticated;
revoke all on function public.pick_boost_intents_to_poll(integer) from public, anon, authenticated;
grant execute on function public.pick_intents_to_poll(integer) to service_role;
grant execute on function public.pick_batch_intents_to_poll(integer) to service_role;
grant execute on function public.pick_booking_intents_to_poll(integer) to service_role;
grant execute on function public.pick_boost_intents_to_poll(integer) to service_role;
