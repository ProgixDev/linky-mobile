-- Rails Lengopay Guinee : Soutra Money, Kulu et la carte bancaire locale.
--
-- Demande client (2026-09-05, jamais satisfaite) : « Pour les profils en
-- Guinee, le bouton Carte bancaire "Stripe" se transforme en page de paiement
-- In App Carte bancaire + Wallet (Paycard, Kulu et Soutra money) via
-- "Lengopay" + un bouton mobile money (Orange Money et MTN) ».
--
-- Jusqu'ici un profil Guinee n'avait AUCUN moyen carte : le bouton Stripe
-- disparaissait au lieu de « se transformer » (Stripe refuse les cartes
-- guineennes, constat client du 2026-07-26).
--
-- 'lengopay-card' est un moyen DISTINCT de 'card', et ce n'est pas cosmetique :
-- 'card' route vers Stripe cote serveur, 'lengopay-card' vers Lengopay. Le
-- serveur ne peut pas trancher lui-meme — usePaymentProfile() (Guinee vs
-- etranger) est entierement cote client, il n'existe aucune derivation
-- serveur du pays. Deux valeurs distinctes sont donc le SEUL moyen d'envoyer
-- l'argent sur le bon rail.

-- ─── orders.payment_method ──────────────────────────────────────────────────
-- La contrainte date du 20260531_01 et n'a jamais bouge ; son nom est celui
-- que Postgres genere par defaut. On la retrouve par sa DEFINITION plutot que
-- par ce nom supposé : sur une table qui porte de l'argent, un `drop ... if
-- exists` qui ne trouve rien laisserait l'ANCIENNE contrainte en place et le
-- premier paiement Soutra Money echouerait en base, apres avoir ete initie
-- chez Lengopay.
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
      where conrelid = 'public.orders'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%payment_method%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.orders add constraint orders_payment_method_check
  check (payment_method in (
    'orange-money', 'mtn-money', 'card', 'wallet',
    'kulu', 'soutramoney', 'lengopay-card'
  ));

-- ─── payment_intents.method ─────────────────────────────────────────────────
-- Meme geste. 'wallet' n'y figure pas et ne doit pas y figurer : une commande
-- payee au portefeuille est reglee dans le RPC, elle n'ouvre jamais d'intention.
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
      where conrelid = 'public.payment_intents'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%method%'
  loop
    execute format('alter table public.payment_intents drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.payment_intents add constraint payment_intents_method_check
  check (method in (
    'orange-money', 'mtn-money', 'card',
    'kulu', 'soutramoney', 'lengopay-card'
  ));

-- ─── L'URL que l'acheteur doit ouvrir (Soutra Money, peut-etre la carte) ────
-- Sans cette colonne, l'URL n'existerait QUE dans la reponse de l'appel qui a
-- cree l'intention : un ecran ferme par erreur, un telephone qui se verrouille,
-- et l'acheteur n'a plus aucun moyen d'atteindre sa page de paiement — il
-- attend 15 min que l'intention expire. La page hebergee v1 se reconstruisait a
-- partir du pay_id ; une URL v2 ne se devine pas.
--
-- Ce n'est PAS un secret au sens du client_secret Stripe : la page demande son
-- code au proprietaire du portefeuille. Elle est donc rendue au proprietaire de
-- la commande par get-order, comme le reste de l'intention.
alter table public.payment_intents add column if not exists rail_action_url text;

comment on column public.payment_intents.rail_action_url is
  'Lengopay v2 webview_url : page ou l''acheteur finit de payer (Soutra Money, '
  'carte). NULL pour les rails qui se confirment sur le telephone (Orange, MTN) '
  'ou par code SMS (Kulu).';
