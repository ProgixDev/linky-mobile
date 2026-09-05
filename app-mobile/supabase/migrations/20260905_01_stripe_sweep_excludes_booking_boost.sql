-- ============================================================================
-- Le balayage des intentions Stripe abandonnees ne doit ramasser QUE des
-- commandes.
--
-- pick_stale_stripe_intents (20260825_01) filtre sur status='pending' et
-- rail='stripe', sans rien exclure d'autre. cron-poll-intents passe ensuite
-- chaque ligne a process_intent_outcome ou process_batch_intent_outcome —
-- deux RPC qui attendent une COMMANDE. Une intention Stripe portant un
-- booking_id (ou un boost_id) y serait envoyee et echouerait, ou pire
-- toucherait la mauvaise ligne.
--
-- Jusqu'a aujourd'hui le defaut etait dormant : aucune intention Stripe ne
-- portait de booking_id, la reservation etant cablee en dur sur Lengopay.
-- L'ajout du rail carte pour les reservations (client 2026-09-04, « faire le
-- lien avec les methodes de paiement comme pour les commandes ») le rendrait
-- atteignable des la premiere reservation payee par carte, 15 minutes plus
-- tard. On ferme donc la porte dans le meme mouvement.
--
-- C'est exactement la precaution que 20260812_01 avait deja prise pour les
-- balayages Lengopay avec « and pi.boost_id is null » ; le balayage Stripe,
-- ecrit plus tard, ne l'avait pas reprise.
--
-- Les reservations payees par carte n'en ont pas besoin : stripe-webhook les
-- regle directement via metadata.kind='booking' -> confirm_booking_payment,
-- qui est idempotent et verifie montant et devise.
--
-- A appliquer en prod (mkaddhcjneilvwqethjo) via l'editeur SQL.
-- ============================================================================

create or replace function public.pick_stale_stripe_intents(p_limit int default 50)
returns table (
  id              uuid,
  order_id        uuid,
  batch_id        uuid,
  rail_intent_id  text,
  amount_minor    bigint,
  created_at      timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
    select i.id, i.order_id, i.batch_id, i.rail_intent_id, i.amount_minor, i.created_at
      from public.payment_intents i
      where i.status = 'pending'
        and i.rail = 'stripe'
        and i.rail_intent_id not like 'pending-init-%'
        -- NOUVEAU : ne ramasser que ce qui appartient au monde des commandes.
        and i.booking_id is null
        and i.boost_id is null
        and i.created_at < now() - interval '15 minutes'
      order by i.created_at asc
      for update of i skip locked
      limit p_limit;
end;
$$;

revoke all on function public.pick_stale_stripe_intents(int) from public, anon, authenticated;
grant execute on function public.pick_stale_stripe_intents(int) to service_role;
