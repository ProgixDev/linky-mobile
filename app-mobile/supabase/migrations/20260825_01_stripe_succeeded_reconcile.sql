-- ============================================================================
-- Filet de securite pour un paiement carte reussi que le webhook Stripe
-- n'aurait jamais traite.
--
-- Trouve en reponse a un vrai signal Stripe (25/08 : 4 tentatives de livraison
-- de webhook en echec sur le compte de production), mais le defaut corrige ici
-- est INDEPENDANT de la cause exacte de cet incident — il existait avant, et
-- resterait meme une fois cet incident precis eclairci.
--
-- CE QUI MANQUAIT : pick_stale_stripe_intents(), le balayage qui tourne toutes
-- les 5 secondes, ne renvoyait QUE ce qu'il fallait pour ANNULER une intention
-- abandonnee apres 15 minutes. Le code appelant, cote cron-poll-intents,
-- interrogeait bien Stripe avant d'annuler — et decouvrait parfois que le
-- paiement avait REELLEMENT abouti (piStatus === 'succeeded'). Dans ce cas il
-- se contentait de sauter la ligne, en commentaire : « le webhook va s'en
-- charger ». Si le webhook ECHOUE a livrer cet evenement — pour n'importe
-- quelle raison, aujourd'hui ou plus tard — cette commande restait bloquee
-- indefiniment en 'placed', l'argent reellement preleve sur la carte du
-- client sans jamais entrer en sequestre, et le vendeur jamais prevenu.
--
-- Le correctif cote TypeScript (cron-poll-intents/index.ts) a besoin de
-- batch_id pour savoir laquelle des deux fonctions de reglement appeler
-- (process_intent_outcome pour une commande simple,
-- process_batch_intent_outcome pour un panier multi-boutiques) — ce que cette
-- migration ajoute a la sortie de la fonction.
--
-- Applique en prod (mkaddhcjneilvwqethjo) via l'editeur SQL.
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
        and i.created_at < now() - interval '15 minutes'
      order by i.created_at asc
      for update of i skip locked
      limit p_limit;
end;
$$;

revoke all on function public.pick_stale_stripe_intents(int) from public, anon, authenticated;
grant execute on function public.pick_stale_stripe_intents(int) to service_role;
