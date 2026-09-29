-- ===========================================================================
-- SONDE : la console des retraits lit le solde de LA BONNE CAISSE
-- ===========================================================================
--
-- LE DÉFAUT (mesuré en prod le 2026-09-29). La console affichait
-- « SOLDE INSUFFISANT » sur deux demandes de 50 000 GNF d'un vendeur qui en
-- avait 96 800, et DÉSACTIVAIT « Marquer payé ». Impossible de payer quelqu'un
-- qui a l'argent.
--
-- `get_wallet_balances_bulk` rend une ligne PAR PORTEFEUILLE mais n'exposait
-- que `(user_id, currency, balance_minor)`. Depuis la séparation des caisses du
-- 2026-09-24, un vendeur peut en avoir DEUX en GNF — `seller` et `immo`. Les
-- deux lignes arrivaient donc avec la même clé, et `list-withdrawals`, qui les
-- rangeait dans une table associative `user_id:currency`, gardait la dernière.
-- Laquelle ? Celle que le plan d'exécution sortait en dernier. Au hasard.
--
-- C'est le piège consigné le jour même de la séparation : tout lookup de
-- portefeuille SANS `kind` prend une ligne au hasard. Il avait été fermé dans
-- les fonctions d'argent ; cette fonction de LECTURE l'avait gardé — et une
-- lecture fausse sur un écran de paiement empêche de payer.
--
-- CE QUE LA SONDE MONTRE. Pour chaque demande en attente, côte à côte :
--   — ce que l'ancien rangement pouvait retenir (une caisse au hasard) ;
--   — le solde de la caisse que la demande DÉSIGNE (`wallet_kind`), c'est-à-dire
--     celle que `process_withdrawal` débitera réellement.
--
-- Elle est DESCRIPTIVE : elle ne lève rien, elle affiche. Le défaut se lit dans
-- l'écart entre les deux colonnes — et il ne peut apparaître que chez un
-- vendeur qui possède deux caisses dans la même devise. Mesure du 2026-09-29 :
--
--     Djenabou Bah   10 000   seller   50 800 -> ok            50 800 -> ok
--     Abdoul         50 000   seller    4 000 -> INSUFFISANT   96 800 -> ok
--     Abdoul         50 000   seller    4 000 -> INSUFFISANT   96 800 -> ok
--
-- À REJOUER après toute modification de `get_wallet_balances_bulk` ou du
-- rangement des soldes dans `list-withdrawals`. Lecture seule, aucune
-- transaction : rien à annuler.
-- ===========================================================================

select coalesce(u.display_name, '?')                as vendeur,
       w.amount_minor                               as demande,
       w.wallet_kind                                as caisse_visee,

       -- CE QUE L'ANCIEN RANGEMENT POUVAIT RETENIR. On prend deliberement la
       -- plus petite des caisses : c'est le pire cas du « au hasard », et le
       -- seul qui se voie a l'ecran.
       (select b.balance_minor
          from public.get_wallet_balances_bulk(array[w.user_id]) b
         where b.currency = w.currency
         order by b.balance_minor asc
         limit 1)                                   as avant_au_hasard,

       -- LE SOLDE DE LA CAISSE QUE LA DEMANDE DESIGNE.
       coalesce((select le.balance_after
                   from public.ledger_entries le
                   join public.wallets wa on wa.id = le.wallet_id
                  where wa.user_id = w.user_id
                    and wa.kind    = w.wallet_kind
                    and wa.currency = w.currency
                  order by le.created_at desc, le.id desc
                  limit 1), 0)                      as apres_bonne_caisse,

       -- Combien de caisses ce vendeur possede dans cette devise : au-dessus de
       -- 1, l'ancien code pouvait se tromper. A 1, les deux colonnes sont
       -- forcement egales et la ligne ne prouve rien.
       (select count(*) from public.wallets wa
         where wa.user_id = w.user_id and wa.currency = w.currency) as nb_caisses

  from public.withdrawal_requests w
  left join public.users u on u.id = w.user_id
 where w.status in ('pending', 'approved')
 order by w.created_at;
