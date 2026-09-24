-- DEUX CAISSES. 3/3 — LA LECTURE.
--
-- Les deux fonctions qui alimentent l'ecran « Portefeuille » ignoraient la
-- notion de caisse. get_wallet_balances rend DEJA une ligne par portefeuille,
-- donc avec deux caisses elle en rend deux — et l'application faisait
-- `balances.find(b => b.currency === 'GNF')`, c'est-a-dire qu'elle prenait la
-- PREMIERE et ignorait l'autre en silence. Le bailleur aurait vu une seule de
-- ses deux caisses, sans savoir laquelle.
--
-- AU PASSAGE, UN DEFAUT DE MEME FAMILLE QUE CELUI DU 2026-09-23.
-- get_wallet_balances lisait le solde dans la chaine `balance_after`, triee par
-- `created_at desc, id desc`. Or `created_at` vaut `transaction_timestamp()` —
-- l'heure de DEBUT de transaction, pas celle de l'ecriture. Une transaction
-- lente demarree avant une rapide ecrit apres elle avec un horodatage
-- anterieur, et la « derniere » ligne selon ce tri n'est alors pas la bonne :
-- le solde AFFICHE pouvait donc etre perime d'un mouvement. post_transfer a
-- ete corrige le 2026-09-23 (20260923_03) en derivant le solde de la somme des
-- ecritures ; cette lecture-ci etait restee en arriere. Elle somme desormais,
-- comme tout le reste. C'est aussi ce que la table annonce depuis le premier
-- jour : « balance_after is a running-balance cache; it stays recomputable as
-- sum(credits)-sum(debits) ».
--
-- LA VENTILATION PAR ORIGINE SURVIT, et elle garde tout son sens : elle dit
-- d'ou vient l'argent A L'INTERIEUR d'une caisse. Un vendeur verra que sa
-- caisse Vendeur contient des ventes moins des retraits ; un bailleur verra que
-- sa caisse Immo ne contient que des loyers. Les deux lectures se completent au
-- lieu de se remplacer.

-- DROP PUIS CREATE, ET NON « CREATE OR REPLACE » : les deux fonctions gagnent
-- une colonne de sortie, et Postgres refuse de changer le type de retour d'une
-- fonction existante (« cannot change return type of existing function »). Le
-- meme detour qu'au passage de place_order a six arguments. Les droits sont
-- donc re-poses explicitement apres chaque creation.

drop function if exists public.get_wallet_balances(uuid);
create function public.get_wallet_balances(p_user_id uuid)
returns table(wallet_id uuid, kind text, currency text, balance_minor bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  select w.id,
         w.kind,
         w.currency,
         coalesce((
           select sum(case when le.direction = 'credit' then le.amount_minor
                           else -le.amount_minor end)
             from public.ledger_entries le
            where le.wallet_id = w.id
         ), 0)::bigint as balance_minor
    from public.wallets w
   where w.user_id = p_user_id
   -- 'seller' avant 'immo' : c'est la caisse que tout le monde possede, et
   -- celle qui paie les achats. Un ecran qui doit n'en montrer qu'une prend
   -- la premiere et tombe juste.
   order by w.currency, (w.kind <> 'seller'), w.kind;
$fn$;

revoke all on function public.get_wallet_balances(uuid) from public, anon, authenticated;
grant execute on function public.get_wallet_balances(uuid) to service_role;

drop function if exists public.get_wallet_origin_breakdown(uuid);
create function public.get_wallet_origin_breakdown(p_user_id uuid)
returns table(kind text, currency text, origin text, net_minor bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  select w.kind,
         w.currency,
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
   group by 1, 2, 3
  -- Une origine qui se solde a zero n'a rien a dire : on ne l'envoie pas.
  having sum(case when le.direction = 'credit'
                  then le.amount_minor
                  else -le.amount_minor end) <> 0
   order by 1, 2, 3;
$fn$;

revoke all on function public.get_wallet_origin_breakdown(uuid) from public, anon, authenticated;
grant execute on function public.get_wallet_origin_breakdown(uuid) to service_role;
