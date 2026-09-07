-- Le declencheur du sondage pointait, DANS L'HISTORIQUE DES MIGRATIONS, sur le
-- projet Supabase decommissionne.
--
-- kick_payment_intents_poll() est appelee par pg_cron toutes les 5 secondes et
-- POSTe sur cron-poll-intents. Sa derniere DEFINITION dans le depot est celle du
-- 20260601_02, qui code en dur l'URL du projet fvvqgcsphwrmdlclnxcz — abandonne
-- depuis. (20260729_02 touche bien cette fonction, mais seulement pour revoquer
-- des droits : elle ne la redefinit pas.)
--
-- LA PRODUCTION, ELLE, EST SAINE : verifie le 2026-09-07, son URL porte bien
-- mkaddhcjneilvwqethjo, le job pg_cron est actif, cadence 5 secondes. Elle avait
-- donc ete corrigee a la main sans que le depot suive.
--
-- CE QUE CETTE MIGRATION EMPECHE : que quelqu'un rejoue l'historique un jour
-- (reconstruction d'une base de test, d'une prod, ou simple reapplication de
-- 20260601_02 pour faire tourner une rotation de secret — ce que son propre
-- en-tete recommande) et ressuscite l'ancienne URL. Le symptome serait
-- silencieux et total : cron-poll-intents ne serait plus jamais appelee, donc
-- AUCUN paiement Lengopay ne serait confirme, et chaque commande mobile money
-- expirerait au bout de 15 minutes sans que rien ne le signale.
--
-- POURQUOI UNE SUBSTITUTION PLUTOT QU'UN `create or replace` COMPLET : le corps
-- de cette fonction contient la cle anon et le secret du cron en clair. Les
-- reecrire ici les graverait une deuxieme fois dans le depot (qui est encore
-- lisible publiquement sur GitHub, cf. l'inventaire du 2026-09-07). On lit donc
-- la definition en place et on n'en change QUE la reference du projet.
--
-- IDEMPOTENTE ET SANS EFFET SUR LA PROD ACTUELLE : si l'URL est deja la bonne,
-- la substitution ne change rien et aucun `execute` n'a lieu.

do $$
declare
  v_src     text;
  v_fixed   text;
  v_old_ref constant text := 'fvvqgcsphwrmdlclnxcz';
  v_new_ref constant text := 'mkaddhcjneilvwqethjo';
begin
  select pg_get_functiondef(p.oid)
    into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'kick_payment_intents_poll'
    limit 1;

  if v_src is null then
    raise notice '[20260907_03] kick_payment_intents_poll absente — rien a faire.';
    return;
  end if;

  v_fixed := replace(v_src, v_old_ref, v_new_ref);

  if v_fixed = v_src then
    raise notice '[20260907_03] URL deja correcte — aucune modification.';
    return;
  end if;

  -- pg_get_functiondef rend un CREATE OR REPLACE complet : le rejouer conserve
  -- le proprietaire, le security definer et le search_path d'origine.
  execute v_fixed;
  raise notice '[20260907_03] URL du cron corrigee : % -> %', v_old_ref, v_new_ref;

  -- Les droits ne sont PAS reconduits par create or replace sur une fonction
  -- existante, mais on les repose par prudence : le durcissement du 20260729_02
  -- avait retire le grant PUBLIC que cette fonction portait, et seul
  -- service_role doit pouvoir la declencher (sinon n'importe qui brule le quota
  -- Lengopay en boucle).
  revoke execute on function public.kick_payment_intents_poll() from public, anon, authenticated;
  grant  execute on function public.kick_payment_intents_poll() to service_role;
end $$;
