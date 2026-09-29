-- ===========================================================================
-- LE SOLDE RENDU EN LOT PORTE SA CAISSE
-- 2026-09-29
-- ===========================================================================
--
-- ┌─ CE QUE L'ÉCRAN DISAIT, ET POURQUOI C'ÉTAIT FAUX ───────────────────────┐
-- La console des retraits affichait « SOLDE INSUFFISANT » sur deux demandes de
-- 50 000 GNF d'un vendeur qui en avait 96 800 — et le bouton « Marquer payé »
-- était désactivé. Impossible de payer quelqu'un qui a l'argent.
--
-- `get_wallet_balances_bulk` rend UNE LIGNE PAR PORTEFEUILLE, mais n'expose
-- que `(user_id, currency, balance_minor)`. Depuis la séparation des caisses du
-- 2026-09-24, un vendeur peut en avoir DEUX en GNF — `seller` et `immo`. Les
-- deux lignes arrivent donc avec la MÊME clé, et l'appelant, qui les range dans
-- une table associative `user_id:currency`, garde la dernière. Laquelle ? Celle
-- que le plan d'exécution a sortie en dernier. Au hasard.
--
-- Mesuré le 2026-09-29 : le vendeur a `seller` = 96 800 et `immo` = 4 000. La
-- console retenait 4 000.
--
-- C'est exactement le piège consigné le jour de la séparation : tout lookup de
-- portefeuille SANS `kind` prend une ligne au hasard. Il avait été fermé dans
-- les fonctions d'argent ; cette fonction de LECTURE l'avait gardé, et une
-- lecture fausse sur un écran de paiement coûte aussi cher qu'une écriture
-- fausse — elle empêche de payer.
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- La correction est de rendre `kind`, pour que l'appelant puisse choisir la
-- caisse que la demande de retrait désigne (`withdrawal_requests.wallet_kind`,
-- qui est déjà ce que `process_withdrawal` débite).
--
-- ⚠️ DROP puis CREATE, et non CREATE OR REPLACE : on change le TYPE DE RETOUR,
-- que Postgres refuse de remplacer en place. Un seul appelant en dépend
-- (`list-withdrawals`), vérifié côté edge ET côté SQL avant d'écrire ce fichier.
--
-- ⚠️ ORDRE DE DÉPLOIEMENT : migration D'ABORD, `list-withdrawals` ENSUITE. Entre
-- les deux, l'ancienne fonction edge reçoit une colonne de plus qu'elle ignore
-- — son comportement ne change pas, elle reste simplement fausse comme avant.
-- L'inverse casserait la page (colonne absente).

begin;

drop function if exists public.get_wallet_balances_bulk(uuid[]);

create function public.get_wallet_balances_bulk(p_user_ids uuid[])
returns table(user_id uuid, kind text, currency text, balance_minor bigint)
language sql
stable
security definer
set search_path to ''
as $fn$
  select w.user_id,
         w.kind,
         w.currency,
         coalesce((select le.balance_after from public.ledger_entries le
                   where le.wallet_id = w.id
                   order by le.created_at desc, le.id desc limit 1), 0)
    from public.wallets w
   where w.user_id = any(p_user_ids);
$fn$;

comment on function public.get_wallet_balances_bulk(uuid[]) is
  'Un solde PAR PORTEFEUILLE. `kind` est indispensable : depuis la separation '
  'des caisses (2026-09-24) un utilisateur peut avoir seller ET immo dans la '
  'meme devise, et un appelant qui range le resultat par (user, devise) garde '
  'alors une ligne au hasard. C''est ce qui affichait " solde insuffisant " sur '
  'la console des retraits pour un vendeur qui avait l''argent.';

-- Le durcissement du 2026-07-29 : Supabase re-accorde EXECUTE par defaut, et un
-- DROP+CREATE repart de zero sur les privileges.
revoke all on function public.get_wallet_balances_bulk(uuid[]) from public, anon, authenticated;
grant execute on function public.get_wallet_balances_bulk(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- CONTRÔLE
-- ---------------------------------------------------------------------------
do $check$
declare
  v_src  text;
  v_oid  oid;
  v_n    int;
begin
  select p.oid, pg_get_functiondef(p.oid) into v_oid, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_wallet_balances_bulk' limit 1;
  if v_src is null then raise exception 'get_wallet_balances_bulk absente'; end if;

  if position('kind text' in v_src) = 0 then
    raise exception 'la fonction ne rend pas kind';
  end if;
  if position('w.kind' in v_src) = 0 then
    raise exception 'la fonction ne selectionne pas w.kind';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'EXECUTE encore ouvert apres le DROP+CREATE';
  end if;

  -- LE POINT QUI COMPTE : sur un utilisateur qui a DEUX caisses dans la meme
  -- devise, la fonction doit rendre DEUX lignes DISTINGUABLES. Avant, elles
  -- etaient indistinguables et l'appelant en perdait une.
  select count(*) into v_n
    from (select user_id, currency from public.wallets
           group by user_id, currency having count(*) > 1) x;
  if v_n > 0 then
    perform 1
       from (select user_id, currency from public.wallets
              group by user_id, currency having count(*) > 1 limit 1) d
      cross join lateral public.get_wallet_balances_bulk(array[d.user_id]) b
      where b.currency = d.currency
      group by d.user_id
     having count(distinct b.kind) > 1;
    if not found then
      raise exception 'deux caisses existent mais la fonction ne les distingue pas';
    end if;
    raise notice '% utilisateur(s) a deux caisses dans une meme devise : desormais distinguables', v_n;
  else
    raise notice 'aucun utilisateur a deux caisses aujourd-hui, la garde reste posee';
  end if;

  raise notice 'le solde rendu en lot porte sa caisse';
end
$check$;

commit;
