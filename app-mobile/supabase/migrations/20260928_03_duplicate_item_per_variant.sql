-- ===========================================================================
-- DEUX TAILLES DU MÊME ARTICLE DANS UNE SEULE COMMANDE
-- 2026-09-28 · lève la limite assumée de 20260928_01
-- ===========================================================================
--
-- CE QUE LE CLIENT A DÉCRIT. « Une paire de chaussures de plusieurs tailles et
-- couleurs » : l'acheteuse qui hésite entre le 41 et le 42 les prend tous les
-- deux. C'est le cas d'usage central de ce lot, pas un cas limite.
--
-- CE QUI LE REFUSAIT. La garde anti-doublon des deux fonctions de commande
-- compare l'ANNONCE seule : `if v_product.id = any(v_seen)`. Deux lignes du même
-- article levaient DUPLICATE_ITEM même avec des combinaisons différentes — et le
-- refus tombait au PAIEMENT, après le choix du moyen de règlement, sur un panier
-- que l'application avait laissé construire sans un mot.
--
-- POURQUOI C'EST SÛR MAINTENANT. Cette garde protégeait d'une double
-- facturation silencieuse, et elle était la SEULE protection : `order_items`
-- n'avait aucune unicité. 20260928_01 a posé `order_items_unique_line_idx` sur
-- (commande, annonce, combinaison). La règle est donc désormais tenue par un
-- index, en base, et non plus par un tableau PL/pgSQL — la relâcher ne rouvre
-- rien.
--
-- LA CLÉ SE LIT DANS LE PAYLOAD, PAS DANS v_variant_id. Les deux fonctions
-- n'assignent pas cette variable au même endroit dans leur boucle
-- (place_order_multi avant la garde, place_orders_batch après) : lire
-- `v_item ->> 'variant_id'` donne le même comportement dans les deux sans avoir
-- à déplacer une ligne sur le chemin de l'argent. `lower()` parce que deux
-- écritures du même UUID passeraient la garde puis heurteraient l'index unique,
-- avec un message que personne ne saurait lire.

begin;

do $relax$
declare
  fn      text;
  v_src   text;
  v_new   text;
  v_key   constant text :=
    '(v_product.id::text || '':'' || lower(coalesce(nullif(v_item ->> ''variant_id'', ''''), '''')))';
  v_guard constant text :=
    'if v_product.id = any(v_seen) then raise exception ''DUPLICATE_ITEM''; end if;';
  v_add   constant text := 'v_seen := v_seen || v_product.id;';
  v_decl  constant text := 'v_seen             uuid[] := ''{}'';';
begin
  foreach fn in array array['place_order_multi', 'place_orders_batch'] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn limit 1;
    if v_src is null then raise exception '% introuvable', fn; end if;

    -- Idempotence : la cle composee est deja en place.
    if position('lower(coalesce(nullif(v_item ->> ''variant_id''' in v_src) > 0 then
      raise notice '% compte deja par combinaison', fn;
      continue;
    end if;

    -- Les trois ancres. Chacune DOIT etre unique : `v_seen` ne sert qu'a cette
    -- garde, et si une deuxieme occurrence apparaissait un jour, remplacer
    -- aveuglement en casserait une.
    if position(v_decl  in v_src) = 0 then raise exception '% : ancre DECLARE introuvable', fn; end if;
    if position(v_guard in v_src) = 0 then raise exception '% : ancre GARDE introuvable', fn; end if;
    if position(v_add   in v_src) = 0 then raise exception '% : ancre AJOUT introuvable', fn; end if;

    -- Le type change : la cle n'est plus un identifiant mais « annonce:combinaison ».
    v_new := replace(v_src, v_decl, 'v_seen             text[] := ''{}'';');

    -- L'AJOUT D'ABORD, LA GARDE ENSUITE : la chaine de la garde contient
    -- `v_product.id`, et remplacer l'ajout apres coup toucherait aussi le texte
    -- qu'on vient d'ecrire.
    v_new := replace(v_new, v_add, 'v_seen := v_seen || ' || v_key || ';');
    v_new := replace(v_new, v_guard,
      '-- Le meme article DEUX FOIS avec la meme combinaison double-facturerait ;
    -- deux combinaisons DIFFERENTES sont un achat normal (le 41 et le 42).
    -- order_items_unique_line_idx tient la meme regle en base.
    if ' || v_key || ' = any(v_seen) then raise exception ''DUPLICATE_ITEM''; end if;');

    execute v_new;
    raise notice '% : le doublon se compte par combinaison', fn;
  end loop;
end
$relax$;

-- Le durcissement du 2026-07-29 : Supabase re-accorde EXECUTE par defaut.
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('place_order_multi', 'place_orders_batch')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------------------
-- CONTRÔLE — les gardes du chemin de l'argent, une par une
-- ---------------------------------------------------------------------------
do $check$
declare
  fn     text;
  v_src  text;
  g      text;
  v_miss text;
begin
  foreach fn in array array['place_order_multi', 'place_orders_batch'] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn limit 1;

    v_miss := null;
    foreach g in array array[
      'INVALID_QUANTITY', 'PRODUCT_NOT_FOUND', 'PRODUCT_NOT_AVAILABLE',
      'DUPLICATE_ITEM', 'BUYER_IS_SELLER', 'OUT_OF_STOCK',
      'INSUFFICIENT_STOCK', 'VARIANT_REQUIRED', 'VARIANT_NOT_FOUND',
      'stock = stock - v_qty', 'kind',
      -- la relache elle-meme, et le type qui la rend possible
      'lower(coalesce(nullif(v_item ->> ''variant_id''', 'v_seen             text[]'
    ] loop
      if position(g in v_src) = 0 then
        v_miss := coalesce(v_miss || ', ', '') || g;
      end if;
    end loop;

    -- L'ancienne comparaison ne doit plus exister NULLE PART : la laisser
    -- quelque part refuserait encore le deuxieme achat.
    if position('v_product.id = any(v_seen)' in v_src) > 0 then
      v_miss := coalesce(v_miss || ', ', '') || 'ANCIENNE GARDE ENCORE PRESENTE';
    end if;

    if v_miss is not null then
      raise exception '% : %', fn, v_miss;
    end if;
  end loop;

  raise notice 'les deux chemins acceptent deux combinaisons du meme article, et rien de plus';
end
$check$;

commit;
