-- Carte bancaire sur le boost (demande client : « Pareil pour le boost aussi »,
-- 2026-09-05). Le boost n'acceptait que le portefeuille et Orange/MTN.
--
-- POURQUOI UNE COLONNE SUR boosts, ET PAS UNE LIGNE payment_intents.
-- C'est le meme choix, pour la meme raison, que booking-sign-pay le 2026-07-29.
-- Une ligne payment_intents(rail='stripe', boost_id=...) serait ORPHELINE : elle
-- n'est ramassee par AUCUN balayage existant —
--   pick_boost_intents_to_poll   exige rail='lengopay'  (20260812_01)
--   expire_stale_boost_intents   exige rail='lengopay'  (20260812_01)
--   pick_stale_stripe_intents    exclut boost_id        (20260905_01)
--   pick_intents_to_poll         exclut boost_id        (20260821_01)
-- et stripe-webhook ne sait router qu'entre une commande et un lot. Elle
-- resterait 'pending' pour toujours, et le boost 'pending_payment' avec elle.
--
-- Le suivi passe donc par boosts.stripe_pi_id, exactement comme
-- bookings.stripe_pi_id, et le reglement par metadata.kind='boost' cote webhook.
-- confirm_boost_payment (20260812_01) est deja idempotente ET deja agnostique du
-- rail : rien a y changer.

alter table public.boosts
  add column if not exists stripe_pi_id text;

-- Un boost ne peut porter qu'une PaymentIntent a la fois, et deux boosts ne
-- peuvent pas partager la meme : sans cela, un doublon passerait inapercu.
create unique index if not exists boosts_stripe_pi_idx
  on public.boosts(stripe_pi_id) where stripe_pi_id is not null;

-- ─── Balayage des PaymentIntents de boost abandonnees ───────────────────────
-- Decalque de pick_stale_booking_pis (20260707_03), y compris le TTL.
--
-- TTL de 24 HEURES, pas 15 minutes, et c'est deliberé : create-boost reutilise
-- la cle d'idempotence Stripe 'boost-pi-<id>', qui rejoue pendant ~24 h chez
-- Stripe. Annuler la PI a l'interieur de cette fenetre rendrait au vendeur qui
-- revient la MEME PaymentIntent, mais annulee — son paiement serait mort sans
-- recours. Passe 24 h, la cle a expire cote Stripe et un nouvel appel cree une
-- PI neuve.
create or replace function public.pick_stale_boost_pis(p_limit int default 20)
returns table (
  boost_id     uuid,
  stripe_pi_id text,
  status       text
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
    select b.id, b.stripe_pi_id, b.status
      from public.boosts b
      where b.stripe_pi_id is not null
        and b.status in ('pending_payment', 'cancelled')
        and b.created_at < now() - interval '24 hours'
      order by b.created_at asc
      for update of b skip locked
      limit p_limit;
end;
$$;

revoke all on function public.pick_stale_boost_pis(int) from public, anon, authenticated;
grant execute on function public.pick_stale_boost_pis(int) to service_role;

-- Efface le tampon apres annulation chez Stripe. Le statut du boost n'est PAS
-- touche : un boost 'pending_payment' reste payable par un nouvel appel, comme
-- une reservation 'accepted' le reste apres le balayage des PI de reservation.
create or replace function public.clear_boost_stripe_pi(p_boost_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.boosts set stripe_pi_id = null where id = p_boost_id;
$$;

revoke all on function public.clear_boost_stripe_pi(uuid) from public, anon, authenticated;
grant execute on function public.clear_boost_stripe_pi(uuid) to service_role;

-- ─── Notification « Boost activé » ──────────────────────────────────────────
-- notifications.ref_type n'admet que ('order','conversation','visit_request',
-- 'booking') depuis 20260706_01 : sans 'boost', l'insertion de la notification
-- envoyee par stripe-webhook a la confirmation violerait la contrainte et le
-- vendeur ne serait jamais prevenu que son boost est actif. Meme geste que le
-- 2026-07-06 pour les reservations.
alter table public.notifications drop constraint if exists notifications_ref_type_check;
alter table public.notifications add constraint notifications_ref_type_check
  check (ref_type in ('order', 'conversation', 'visit_request', 'booking', 'boost'));
