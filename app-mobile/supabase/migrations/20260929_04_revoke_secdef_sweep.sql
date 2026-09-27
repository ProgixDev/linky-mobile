-- ===========================================================================
-- REFERMER LES FONCTIONS SECURITY DEFINER QUE SUPABASE A RÉ-OUVERTES
-- 2026-09-27 · rétablit l'invariant du durcissement du 2026-07-29
-- ===========================================================================
--
-- CE QUI S'EST PASSÉ. Le lot « déclinaisons » (20260928_01) a créé trois
-- fonctions de DÉCLENCHEUR en SECURITY DEFINER — `rollup_product_variants`,
-- `fill_order_item_variant`, `forbid_partial_variant_price` — et son bloc de
-- droits ne couvrait que les quatre fonctions appelées par les fonctions edge.
-- Les trois déclencheurs ont donc gardé les droits que Supabase accorde PAR
-- DÉFAUT à la création : `PUBLIC`, `anon` et `authenticated`.
--
-- CE QUE ÇA VAUT RÉELLEMENT. Presque rien : une fonction qui retourne `trigger`
-- ne peut pas être appelée autrement que par un déclencheur — PostgREST ne
-- l'expose pas, et un appel direct lève « trigger functions can only be called
-- as triggers ». Ce n'est donc pas une porte ouverte, c'est un invariant qui
-- s'effrite. Mais c'est exactement ainsi que le durcissement du 2026-07-29
-- s'annulerait, une migration à la fois, et l'advisor Supabase le signale.
--
-- POURQUOI UN BALAYAGE ET PAS TROIS `revoke`. Parce que le problème n'est pas
-- ces trois-là : c'est qu'on l'oublie. Supabase ré-accorde à CHAQUE création de
-- fonction, donc la liste en dur serait périmée à la prochaine migration. Ce
-- fichier est **idempotent et rejouable** : le passer après n'importe quelle
-- migration future suffit à refermer ce qu'elle aurait laissé ouvert.
--
-- LA GARANTIE QUI REND CE BALAYAGE SÛR : l'application n'appelle JAMAIS une RPC
-- en direct. Tout passe par une fonction edge, qui utilise la clé service_role.
-- Révoquer `anon` et `authenticated` ne peut donc rien casser — c'est le
-- raisonnement du 2026-07-29, et il tient toujours.

begin;

do $sweep$
declare
  r       record;
  v_n     int := 0;
  v_names text := '';
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and (
            array_to_string(p.proacl, ',') like '%anon=%'
         or array_to_string(p.proacl, ',') like '%authenticated=%'
         -- `=X/...` sans role nomme = le droit accorde a PUBLIC.
         or array_to_string(p.proacl, ',') like '%,=X/%'
         or array_to_string(p.proacl, ',') like '=X/%'
       )
     order by p.proname
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
    v_n := v_n + 1;
    v_names := case when v_names = '' then r.proname else v_names || ', ' || r.proname end;
  end loop;

  if v_n = 0 then
    raise notice 'rien a refermer : toutes les fonctions SECURITY DEFINER etaient deja closes';
  else
    raise notice '% fonction(s) refermee(s) : %', v_n, v_names;
  end if;
end
$sweep$;

-- ---------------------------------------------------------------------------
-- CONTRÔLE — l'invariant, énoncé et vérifié
-- ---------------------------------------------------------------------------
do $check$
declare
  v_open int;
  v_list text;
begin
  select count(*),
         coalesce(string_agg(p.proname, ', ' order by p.proname), '')
    into v_open, v_list
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and (
          array_to_string(p.proacl, ',') like '%anon=%'
       or array_to_string(p.proacl, ',') like '%authenticated=%'
       or array_to_string(p.proacl, ',') like '%,=X/%'
       or array_to_string(p.proacl, ',') like '=X/%'
     );

  if v_open <> 0 then
    raise exception '% fonction(s) SECURITY DEFINER encore ouverte(s) : %', v_open, v_list;
  end if;

  raise notice 'AUCUNE fonction SECURITY DEFINER n''est atteignable par anon, authenticated ou public';
end
$check$;

commit;
