-- ===========================================================================
-- LE LIBELLE DE LA COMBINAISON : DEUX DEFAUTS TROUVES APRES DEPLOIEMENT
-- 2026-09-28 -- corrige 20260928_01 (chirurgie), ne touche a rien d'autre
-- ===========================================================================
--
-- CE FICHIER EST EN ASCII PUR, ET C'EST LE SUJET MEME DU DEUXIEME DEFAUT.
-- Verifie ce jour : le fichier du depot contient bien 3 vrais U+00B7 (octets
-- C2 B7) et aucun caractere de remplacement, mais la fonction DEPLOYEE en
-- contient 6 x U+FFFD. Le trajet fichier -> presse-papiers -> editeur SQL
-- Supabase -> base detruit donc le non-ASCII. Ca n'avait jamais ete visible
-- parce que, dans toutes les migrations precedentes, les accents vivaient dans
-- des commentaires de bloc `do $$` ou de premier niveau : rien de tout cela
-- n'est STOCKE. 20260928_01 est la premiere a avoir mis un caractere non-ASCII
-- dans un CORPS DE FONCTION, et dans une chaine executee.
--
-- REGLE QUI EN DECOULE : tout caractere non-ASCII destine a un corps de
-- fonction s'ecrit `chr(n)`, jamais en litteral. Ici chr(183) = U+00B7.
--
-- ---------------------------------------------------------------------------
-- DEFAUT 1 (visible par le vendeur) -- LE SEPARATEUR EST CASSE
-- ---------------------------------------------------------------------------
-- `41` + `Noire` donne aujourd'hui `41 <U+FFFD> Noire` : le vendeur lit un
-- losange noir a la place du point median, sur l'ecran meme qui lui dit quel
-- exemplaire sortir de sa boutique. Une taille seule s'affiche correctement
-- (le trim retire le caractere casse), donc le defaut ne se voit QUE sur les
-- combinaisons a deux axes -- c'est-a-dire l'exemple du client.
--
-- ---------------------------------------------------------------------------
-- DEFAUT 2 (plus grave : il MENT) -- LE LIBELLE FUITE D'UNE LIGNE A L'AUTRE
-- ---------------------------------------------------------------------------
-- `v_variant_label` n'est affecte QUE dans la branche `if v_product.has_variants`,
-- et jamais remis a zero en debut de tour. Dans une commande MIXTE -- une paire
-- de chaussures a declinaisons, puis un article qui n'en a pas -- la deuxieme
-- ligne conserve le libelle de la premiere. L'instantane du t-shirt part alors
-- avec `variantId = null` (celui-la est bien reaffecte a chaque tour) mais
-- `variantLabel = '41 ... Noire'`.
--
-- Consequence : l'argent et le stock sont justes (variant_id est correct, donc
-- la remontee et la restitution visent la bonne ligne), mais l'ecran de
-- preparation du vendeur affiche une taille sur un article qui n'en a pas.
-- C'est exactement la facon dont on expedie le mauvais colis.
--
-- Les deux fonctions de commande sont touchees a l'identique.
--
-- CHIRURGIE, PAS CREATE OR REPLACE : ces deux corps ont deja subi trois
-- passes de chirurgie de texte (20260924_05/06, 20260926_02, 20260928_01/03).
-- Les recreer depuis un fichier du depot ferait reculer la prod.

begin;

do $fix$
declare
  fn        text;
  v_src     text;
  v_new     text;
  -- L'affectation de la combinaison, presente une seule fois par fonction et
  -- strictement ASCII : c'est notre point d'insertion pour la remise a zero.
  v_anchor  constant text := 'v_variant_id := nullif(v_item ->> ''variant_id'', '''')::uuid;';
  -- Le nouveau calcul du libelle. concat_ws saute les NULL, donc il n'y a plus
  -- rien a rogner : un axe absent disparait de lui-meme, et le separateur
  -- n'apparait qu'entre deux valeurs reellement presentes. L'ancienne version
  -- devait trimmer, et c'est ce trim qui masquait a moitie le caractere casse.
  v_label   constant text :=
    'v_variant_label := nullif(concat_ws(chr(32) || chr(183) || chr(32), '
    || 'nullif(v_variant.size, ''''), nullif(v_variant.color, '''')), '''');';
begin
  foreach fn in array array['place_order_multi', 'place_orders_batch'] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn limit 1;
    if v_src is null then raise exception '% introuvable', fn; end if;

    if position('concat_ws(chr(32) || chr(183)' in v_src) > 0 then
      raise notice '% : deja corrigee', fn;
      continue;
    end if;

    if position(v_anchor in v_src) = 0 then
      raise exception '% : ancre d''affectation introuvable', fn;
    end if;
    -- Sans cette garde, un jour ou l'ancre apparaitrait deux fois, la remise a
    -- zero serait posee deux fois et la seconde ecraserait un libelle valide.
    if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception '% : ancre d''affectation presente plusieurs fois', fn;
    end if;

    -- (a) LE LIBELLE REPART DE ZERO A CHAQUE TOUR. Pose juste apres
    --     l'affectation de v_variant_id, qui a lieu avant toute lecture.
    v_new := replace(v_src, v_anchor, v_anchor || '
    v_variant_label := null;');

    -- (b) LE SEPARATEUR PAR CODEPOINT. On vise l'instruction par motif et non
    --     par texte exact : son contenu actuel porte precisement les octets
    --     casses qu'on refuse de reecrire dans ce fichier.
    if v_new !~ 'v_variant_label := nullif\(trim\(' then
      raise exception '% : instruction de libelle introuvable', fn;
    end if;
    v_new := regexp_replace(v_new,
      'v_variant_label := nullif\(trim\(.*?\), ''''\);',
      v_label, 'g');

    -- (c) LES QUATRE OCCURRENCES RESTANTES SONT DANS DES COMMENTAIRES (des
    --     guillemets francais qui encadraient deux citations). Un guillemet
    --     droit y est exact, et laisser des caracteres casses dans un corps
    --     de fonction rendrait tout futur balayage bruyant.
    v_new := replace(v_new, chr(65533), chr(34));

    execute v_new;
    raise notice '% : libelle remis a zero par tour, separateur reconstruit', fn;
  end loop;
end
$fix$;

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
-- CONTROLE
-- ---------------------------------------------------------------------------
do $check$
declare
  fn     text;
  v_src  text;
  g      text;
  v_miss text;
  v_two  text;
  v_one  text;
begin
  -- 1. Le calcul lui-meme, eprouve hors des fonctions : c'est la seule facon
  --    de prouver que le separateur est le BON caractere et pas un autre.
  select nullif(concat_ws(chr(32) || chr(183) || chr(32),
                nullif('41', ''), nullif('Noire', '')), '') into v_two;
  if v_two <> '41' || chr(32) || chr(183) || chr(32) || 'Noire' then
    raise exception 'separateur inattendu : %', v_two;
  end if;
  if position(chr(65533) in v_two) > 0 then
    raise exception 'le libelle contient encore un caractere de remplacement';
  end if;

  -- 2. Un seul axe ne doit pas trainer de separateur orphelin.
  select nullif(concat_ws(chr(32) || chr(183) || chr(32),
                nullif('41', ''), nullif('', '')), '') into v_one;
  if v_one <> '41' then raise exception 'axe unique mal rendu : [%]', v_one; end if;

  -- 3. Les deux corps : le correctif present, les gardes intactes.
  foreach fn in array array['place_order_multi', 'place_orders_batch'] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn limit 1;

    v_miss := null;
    foreach g in array array[
      -- le correctif
      'v_variant_label := null;', 'concat_ws(chr(32) || chr(183) || chr(32)',
      -- les gardes du chemin de l'argent, une par une
      'INVALID_QUANTITY', 'PRODUCT_NOT_FOUND', 'PRODUCT_NOT_AVAILABLE',
      'DUPLICATE_ITEM', 'BUYER_IS_SELLER', 'OUT_OF_STOCK',
      'INSUFFICIENT_STOCK', 'VARIANT_REQUIRED', 'VARIANT_NOT_FOUND',
      'VARIANT_UNEXPECTED', 'stock = stock - v_qty', 'kind',
      -- la relache du 20260928_03 et le type qui la porte
      'lower(coalesce(nullif(v_item ->> ''variant_id''', 'v_seen             text[]',
      -- l'instantane qui transporte la combinaison jusqu'a order_items
      '''variantId'', v_variant_id', '''variantLabel'', v_variant_label'
    ] loop
      if position(g in v_src) = 0 then
        v_miss := coalesce(v_miss || ', ', '') || g;
      end if;
    end loop;

    if position(chr(65533) in v_src) > 0 then
      v_miss := coalesce(v_miss || ', ', '') || 'CARACTERE CASSE RESTANT';
    end if;
    if position('v_product.id = any(v_seen)' in v_src) > 0 then
      v_miss := coalesce(v_miss || ', ', '') || 'ANCIENNE GARDE ANTI-DOUBLON';
    end if;
    if position('nullif(trim(both' in v_src) > 0 then
      v_miss := coalesce(v_miss || ', ', '') || 'ANCIEN CALCUL DE LIBELLE';
    end if;

    if v_miss is not null then
      raise exception '% : %', fn, v_miss;
    end if;
  end loop;

  raise notice 'libelle juste, remis a zero par ligne, et les gardes sont toutes la';
end
$check$;

commit;
