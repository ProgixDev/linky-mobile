-- D'OU VIENT L'ARGENT D'UN PORTEFEUILLE.
--
-- DEMANDE DU CLIENT, 2026-09-09 : « j'ai pas eu de reservation de logement mais
-- mon Wallet Immo est credite. Je pense que c'est parce que les 3 wallet sont
-- communs. » Son diagnostic etait juste — il y a UN wallet par utilisateur
-- (wallets, unique (user_id, currency)), affiche sur trois tableaux de bord.
-- Les 10 000 GNF venaient d'une vraie vente d'article sur sa boutique ATLAS.
--
-- Il veut a terme des caisses SEPAREES ; en attendant il a valide l'option
-- courte : un seul solde, mais chaque ecran dit d'ou vient l'argent. C'est ce
-- que fait cette fonction — un calcul en LECTURE SEULE, aucun chemin d'argent
-- touche, aucune ecriture deplacee.
--
-- POURQUOI CA MARCHE SANS RIEN CHANGER AU MODELE : le grand livre porte deja
-- `ref_type` sur chaque ecriture, depuis le premier jour. L'origine n'a jamais
-- eu besoin d'etre stockee ailleurs, elle etait deja la.
--
-- LA SOMME DES ORIGINES EGALE LE SOLDE, par construction : on classe TOUTES les
-- ecritures et on somme credit - debit, exactement comme get_wallet_balances
-- derive le solde. Un ref_type inconnu tombe dans 'other' plutot que d'etre
-- ignore — sinon un futur type de mouvement ferait silencieusement diverger le
-- detail du total, ce qui est la pire facon de perdre la confiance dans un
-- ecran d'argent.
--
-- LES ORIGINES, relevees sur les appels reels a post_transfer dans les
-- migrations (11 ref_type distincts) :
--   products    order_release        une vente d'article encaissee
--   properties  booking_release      une location ou vente immobiliere encaissee
--   topup       credit               une recharge du portefeuille
--   refund      order_refund, order_fee_refund, booking_refund
--   purchase    order_escrow         un achat paye depuis le portefeuille
--   boost       boost_purchase       une mise en avant payee
--   withdrawal  debit                un retrait
-- order_platform_fee et booking_platform_fee n'apparaissent jamais ici : ils
-- vont au portefeuille de la plateforme, pas a celui d'un utilisateur.
create or replace function public.get_wallet_origin_breakdown(p_user_id uuid)
returns table (currency text, origin text, net_minor bigint)
language sql
security definer
set search_path = ''
as $$
  select w.currency,
         case le.ref_type
           when 'order_release'    then 'products'
           when 'booking_release'  then 'properties'
           when 'credit'           then 'topup'
           when 'debit'            then 'withdrawal'
           when 'boost_purchase'   then 'boost'
           when 'order_escrow'     then 'purchase'
           when 'order_refund'     then 'refund'
           when 'order_fee_refund' then 'refund'
           when 'booking_refund'   then 'refund'
           else 'other'
         end as origin,
         sum(case when le.direction = 'credit'
                  then le.amount_minor
                  else -le.amount_minor end)::bigint as net_minor
  from public.ledger_entries le
  join public.wallets w on w.id = le.wallet_id
  where w.user_id = p_user_id
  group by 1, 2
  -- Une origine qui se solde a zero n'a rien a dire : on ne l'envoie pas.
  having sum(case when le.direction = 'credit'
                  then le.amount_minor
                  else -le.amount_minor end) <> 0
  order by 1, 2;
$$;

-- Supabase re-accorde EXECUTE a public/anon/authenticated par defaut sur toute
-- nouvelle fonction : on revoque, comme pour les 47 autres (cf. durcissement du
-- 2026-07-29). Seules les fonctions edge, en service_role, doivent l'appeler.
revoke all on function public.get_wallet_origin_breakdown(uuid) from public, anon, authenticated;
grant execute on function public.get_wallet_origin_breakdown(uuid) to service_role;
