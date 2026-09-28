-- ===========================================================================
-- SONDE : publier en deux temps ne rend rien d'achetable entre les deux
--         (trouvaille #16 de l'audit des declinaisons)
-- ===========================================================================
--
-- CE QUE product-create FAIT DESORMAIS. Une annonce a declinaisons s'ecrit en
-- DEUX appels : la ligne produit, puis la matrice. Elle naissait `active`, donc
-- le premier temps etait publiable a lui seul : si le second echouait, le
-- vendeur lisait une erreur pendant que son annonce etait EN LIGNE sans aucune
-- taille, et chaque reessai en publiait une de plus. Elle nait maintenant
-- `pending` et ne devient `active` qu'une fois la matrice ecrite.
--
-- CE QUE CETTE SONDE PROUVE, et qui est le seul point qui porte le correctif :
--   1. la remontee des declinaisons ne republie PAS l'annonce au passage ;
--   2. pendant la fenetre, la commande est refusee (PRODUCT_NOT_AVAILABLE) ;
--   3. apres la bascule, la MEME commande passe — la fenetre est sure sans que
--      la publication soit cassee ;
--   4. supprimer une annonce neuve emporte ses combinaisons (ON DELETE
--      CASCADE), ce sur quoi repose le retrait apres un echec de la matrice.
--
-- SON CONTROLE NEGATIF. Remplacer `'pending'` par `'active'` a l'insertion (et
-- l'assertion de status qui va avec) : la sonde doit alors echouer sur
-- << une annonce en attente a ete COMMANDEE >>. C'est le defaut d'origine, et
-- une sonde qui passe dans les deux cas ne verifie rien. Mesure du 2026-09-28 :
-- verte telle quelle, rouge ainsi modifiee.
--
-- COMMENT LA LANCER : editeur SQL Supabase, ou POST .../database/query. Elle se
-- termine par `rollback` — rien ne subsiste. Elle EMPRUNTE un vrai vendeur et un
-- vrai acheteur (`users` a trop de contraintes pour un jeu d'essai jetable) :
-- c'est le rollback qui rend cela sans danger. Ne jamais en faire une migration,
-- ne jamais remplacer sa derniere ligne par `commit`.
-- ===========================================================================

-- PREUVE : la fenetre de publication en deux temps est INCOMMANDABLE, et la
-- bascule finale rend bien l'annonce achetable. Transaction ANNULEE.
begin;

do $t$
declare
  v_shop   uuid; v_seller uuid; v_buyer uuid; v_prod uuid;
  v_va     uuid; v_vb uuid; v_order uuid;
  v_msg    text;
  v_has    boolean; v_status text; v_n int;
begin
  select s.id, s.owner_id into v_shop, v_seller
    from public.shops s where s.kind = 'shop' order by s.created_at limit 1;
  select u.id into v_buyer from public.users u where u.id <> v_seller limit 1;

  -- ETAPE 1 : la ligne produit, telle que product-create l'insere DESORMAIS
  -- quand une matrice doit suivre.
  insert into public.products (shop_id, title, price_minor, category, condition, city, status, stock)
    values (v_shop, 'SONDE #16 - a supprimer', 1000, 'mode', 'neuf', 'Conakry', 'pending', null)
    returning id into v_prod;

  -- ETAPE 2 : la matrice.
  perform public.replace_product_variants(v_prod, jsonb_build_array(
    jsonb_build_object('size', '41', 'color', 'Noire', 'stock', 3),
    jsonb_build_object('size', '44', 'color', 'Noire', 'stock', 2)
  ));
  select has_variants, status into v_has, v_status from public.products where id = v_prod;
  if not v_has then raise exception 'ECHEC : la remontee n-a pas pose has_variants'; end if;
  -- LE POINT DELICAT : la remontee ne doit pas avoir republie l-annonce.
  if v_status <> 'pending' then raise exception 'ECHEC : la remontee a change le status en %', v_status; end if;

  select id into v_va from public.product_variants where product_id = v_prod and size = '41';
  select id into v_vb from public.product_variants where product_id = v_prod and size = '44';

  -- ETAPE 3 : PENDANT la fenetre, l-annonce est complete mais PAS publiee.
  -- Personne ne doit pouvoir la commander.
  begin
    v_order := public.place_order_multi(
      v_buyer,
      jsonb_build_array(jsonb_build_object('product_id', v_prod, 'variant_id', v_va, 'quantity', 1)),
      'orange-money', 'pickup', 0);
    raise exception 'ECHEC #16 : une annonce en attente a ete COMMANDEE';
  exception
    when others then
      v_msg := sqlerrm;
      if v_msg <> 'PRODUCT_NOT_AVAILABLE' then raise; end if;
  end;

  -- ETAPE 4 : la bascule finale. La MEME commande doit maintenant passer —
  -- sinon la fenetre serait sure mais la publication cassee.
  update public.products set status = 'active' where id = v_prod;
  v_order := public.place_order_multi(
    v_buyer,
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'variant_id', v_va, 'quantity', 1)),
    'orange-money', 'pickup', 0);
  if v_order is null then raise exception 'ECHEC : l-annonce publiee reste incommandable'; end if;
  select stock into v_n from public.product_variants where id = v_va;
  if v_n <> 2 then raise exception 'ECHEC : le stock de la combinaison n-a pas bouge (%)', v_n; end if;

  raise notice 'fenetre sure ET publication effective';
end
$t$;

-- ETAPE 5 : le nettoyage du chemin d-echec. Une annonce neuve se supprime, et
-- ses combinaisons partent avec elle (ON DELETE CASCADE) — c-est ce sur quoi
-- repose le retrait apres un echec de la matrice.
do $c$
declare v_shop uuid; v_prod uuid; v_left int;
begin
  select s.id into v_shop from public.shops s where s.kind = 'shop' order by s.created_at limit 1;
  insert into public.products (shop_id, title, price_minor, category, condition, city, status)
    values (v_shop, 'SONDE #16b - a supprimer', 1000, 'mode', 'neuf', 'Conakry', 'pending')
    returning id into v_prod;
  perform public.replace_product_variants(v_prod, jsonb_build_array(
    jsonb_build_object('size', 'M', 'color', '', 'stock', 1)));
  delete from public.products where id = v_prod;
  select count(*) into v_left from public.product_variants where product_id = v_prod;
  if v_left <> 0 then raise exception 'ECHEC : % combinaison(s) survivent a la suppression', v_left; end if;
  raise notice 'le retrait apres echec ne laisse rien';
end
$c$;

rollback;
