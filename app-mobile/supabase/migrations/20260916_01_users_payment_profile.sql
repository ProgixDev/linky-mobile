-- LA REGION DE PAIEMENT EST CHOISIE A L'INSCRIPTION, ET ELLE Y RESTE.
--
-- Demande du client, 2026-09-16, capture de Reglages > Confidentialite a l'appui :
--   « Le bouton est trop cache pour activer. On peut deja verrouiller au moment
--     de l'inscription : si profil en Guinee paiement par carte (LengoPay), si
--     profil a l'etranger paiement par carte (Stripe). »
--
-- LE DIAGNOSTIC DU CLIENT EST CONFIRME PAR LA BASE : sur 20 comptes, AUCUN n'a
-- jamais active l'interrupteur « Je vis a l'etranger » (payment_abroad_override).
--
-- CE QUE L'APPLICATION PROMETTAIT DEJA. Le premier ecran de l'inscription
-- demande « Vous etes ou ? » et precise « On adapte le paiement selon votre
-- region ». Mais la reponse n'etait jamais enregistree : elle servait seulement
-- a choisir entre telephone et e-mail, et la region etait ensuite RECALCULEE a
-- partir de l'indicatif du telephone (src/lib/paymentProfile.ts). Une personne
-- inscrite « a l'etranger » qui ajoutait plus tard son numero +224 basculait
-- donc en Guinee et perdait Stripe, sans rien avoir demande.
--
-- POURQUOI UNE COLONNE NEUVE PLUTOT QUE payment_abroad_override. Ce booleen est
-- asymetrique : il sait forcer « etranger », jamais « Guinee ». La regle du
-- client est symetrique — chaque region a son prestataire carte. Une valeur
-- explicite a deux etats dit exactement ce qui a ete declare.
--
-- NULL VEUT DIRE « PAS DECLARE », et c'est le cas des 20 comptes existants. On ne
-- les remplit PAS : leur region actuelle est calculee par la regle de
-- l'indicatif, et l'y geler maintenant figerait peut-etre une erreur que
-- personne n'a encore vue. L'application garde donc cette regle comme repli pour
-- les comptes sans valeur, et la valeur declaree prime des qu'elle existe.
--
-- LE VERROU VIT DANS update-profile : la colonne ne s'ecrit qu'une fois, tant
-- qu'elle est NULL. Une correction exceptionnelle (quelqu'un qui s'est trompe,
-- ou qui a demenage) passe par l'equipe Linky, pas par l'application.
alter table public.users
  add column if not exists payment_profile text
  check (payment_profile in ('guinea', 'abroad'));

comment on column public.users.payment_profile is
  'Region de paiement declaree a l''inscription : guinea (carte via Lengopay) ou abroad (carte via Stripe). NULL = compte anterieur au 2026-09-16, region deduite de l''indicatif. Ecrite une seule fois (verrou dans update-profile).';
