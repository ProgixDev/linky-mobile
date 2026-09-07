-- PayCard comme moyen de paiement a part entiere.
--
-- CE QUE C'EST. PayCard est une carte prepayee guineenne a numero de compte.
-- Le client la nommait depuis des semaines sans qu'on sache a quoi elle
-- correspondait ; c'est la passerelle 3 de Lengopay, activee sur le compte
-- Linky. Sur leur page hebergee elle est enterree sous l'onglet « Wallet »
-- puis un menu deroulant « Type de portefeuille ». Demande d'Abdoulaye du
-- 2026-09-07 : la sortir au meme niveau que Kulu et Soutra Money.
--
-- POURQUOI UNE COLONNE D'ETAT. PayCard se paie en DEUX appels, comme Kulu :
--   1. numero de carte + telephone -> Lengopay renvoie une reference
--      d'operation et un jeton de session ;
--   2. code de verification -> finalisation, avec TOUS les champs de l'etape 1
--      a renvoyer tels quels.
-- Leur propre page garde ces champs dans le localStorage du navigateur entre
-- les deux appels. Nous n'avons pas de navigateur : l'acheteur peut fermer
-- l'application entre les deux ecrans, et le code arrive par SMS avec le delai
-- d'un reseau guineen. Il faut donc les persister cote serveur.
--
-- rail_context porte ces champs, et RIEN D'AUTRE. Ce n'est pas un fourre-tout :
-- le numero de carte de l'acheteur n'y est jamais ecrit — Lengopay nous le
-- rend deja masque dans info_payment.cardnumber, et nous n'avons aucune raison
-- de detenir un numero de compte bancaire.

do $intents$
declare v_con text;
begin
  select conname into v_con
    from pg_constraint
   where conrelid = 'public.payment_intents'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%mtn-money%';
  if v_con is not null then
    execute format('alter table public.payment_intents drop constraint %I', v_con);
  end if;
  alter table public.payment_intents
    add constraint payment_intents_method_check
    check (method = any (array[
      'orange-money', 'mtn-money', 'card', 'kulu',
      'soutramoney', 'lengopay-card', 'paycard'
    ]));
end $intents$;

do $orders$
declare v_con text;
begin
  select conname into v_con
    from pg_constraint
   where conrelid = 'public.orders'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%mtn-money%';
  if v_con is not null then
    execute format('alter table public.orders drop constraint %I', v_con);
  end if;
  alter table public.orders
    add constraint orders_payment_method_check
    check (payment_method = any (array[
      'orange-money', 'mtn-money', 'card', 'wallet', 'kulu',
      'soutramoney', 'lengopay-card', 'paycard'
    ]));
end $orders$;

alter table public.payment_intents
  add column if not exists rail_context jsonb;

comment on column public.payment_intents.rail_context is
  'Etat opaque rendu par la premiere etape d''un rail en deux temps (PayCard), a renvoyer tel quel a la finalisation. Jamais de numero de carte en clair.';
