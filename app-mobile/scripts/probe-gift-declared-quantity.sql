-- ===========================================================================
-- SONDE : un don ne se réserve qu'autant de fois qu'il y a d'objets
--         (trouvaille #5 de l'audit des déclinaisons)
-- ===========================================================================
--
-- LE DÉFAUT. `place_gift_order` ne décrémente que si `products.stock` n'est pas
-- nul, et laisse l'annonce `active` dans tous les cas. Un don à quantité non
-- déclarée était donc ILLIMITÉ. Mesure du 2026-09-28 sur la prod (en
-- transaction annulée) : TROIS réservations sur le même objet, dont une de cent
-- unités, toutes en `paid`, toutes « à retirer chez le donneur ».
--
-- LE CHEMIN. Une annonce à déclinaisons dont une combinaison n'a pas de quantité
-- voit son agrégat passer à `null` ; le vendeur retire ses déclinaisons — la
-- remontée laisse `stock` INCHANGÉ, à dessein — puis coche « À donner ». Le
-- `null` a survécu.
--
-- CE QUE LA SONDE PROUVE, après 20260929_06 :
--   1. l'agrégat passe bien à `null` dès qu'une combinaison n'est pas chiffrée
--      (la prémisse de l'audit, vérifiée et non supposée) ;
--   2. il y survit au retrait de la matrice ;
--   3. basculer en don dans cet état est REFUSÉ par la base ;
--   4. avec une quantité, la bascule passe ;
--   5. le don se réserve UNE fois, la seconde tentative reçoit OUT_OF_STOCK ;
--   6. la commande de don porte `stock_taken`, donc l'annulation rendra l'objet.
--
-- SON CONTRÔLE NÉGATIF EST GRATUIT : lancée AVANT la migration, elle échoue à
-- l'étape 3 sur « la bascule en don a ete ACCEPTEE avec une quantite nulle ».
-- C'est exactement le défaut. Mesure du 2026-09-28 : rouge avant, verte après.
--
-- COMMENT LA LANCER : éditeur SQL Supabase, ou POST .../database/query. Elle se
-- termine par `rollback` — rien ne subsiste. Elle EMPRUNTE un vrai vendeur et
-- deux vrais acheteurs (`users` a trop de contraintes pour un jeu d'essai
-- jetable) : c'est le rollback qui rend cela sans danger. Ne jamais en faire une
-- migration, ne jamais remplacer sa dernière ligne par `commit`.
-- ===========================================================================

begin;

do $t$
declare
  v_shop uuid; v_seller uuid; v_b1 uuid; v_b2 uuid; v_prod uuid;
  v_stock int; v_order uuid; v_taken boolean; v_msg text;
begin
  select s.id, s.owner_id into v_shop, v_seller
    from public.shops s where s.kind = 'shop' order by s.created_at limit 1;
  select id into v_b1 from public.users where id <> v_seller order by created_at limit 1;
  select id into v_b2 from public.users where id <> v_seller and id <> v_b1 order by created_at limit 1;
  if v_shop is null or v_b1 is null or v_b2 is null then raise exception 'pas de jeu de donnees'; end if;

  -- 1. UNE COMBINAISON NON CHIFFREE REND L'ANNONCE SANS PLAFOND
  insert into public.products (shop_id, title, price_minor, category, condition, city, status, stock)
    values (v_shop, 'SONDE #5 - a supprimer', 1000, 'mode', 'neuf', 'Conakry', 'active', 7)
    returning id into v_prod;
  perform public.replace_product_variants(v_prod, jsonb_build_array(
    jsonb_build_object('size', '41', 'color', 'Noire', 'stock', null),
    jsonb_build_object('size', '44', 'color', 'Noire', 'stock', 2)));
  select stock into v_stock from public.products where id = v_prod;
  if v_stock is not null then raise exception 'PREMISSE FAUSSE : l-agregat vaut % au lieu de null', v_stock; end if;

  -- 2. IL SURVIT AU RETRAIT DE LA MATRICE (la remontee ne remet pas de stock,
  --    pour ne pas mettre en rupture une annonce que le vendeur redevient simple)
  perform public.replace_product_variants(v_prod, '[]'::jsonb);
  select stock into v_stock from public.products where id = v_prod;
  if v_stock is not null then raise exception 'PREMISSE FAUSSE : le retrait a repose une quantite (%)', v_stock; end if;

  -- 3. LE POINT QUI PORTE TOUT : basculer en don dans cet etat est refuse
  begin
    update public.products set is_gift = true, price_minor = 0 where id = v_prod;
    raise exception 'DEFAUT #5 OUVERT : la bascule en don a ete ACCEPTEE avec une quantite nulle';
  exception
    when check_violation then
      null;  -- attendu : products_gift_has_stock
  end;

  -- 4. AVEC UNE QUANTITE, ELLE PASSE. C'est ce que font desormais
  --    product-create et product-update (1 par defaut).
  update public.products set is_gift = true, price_minor = 0, stock = 1 where id = v_prod;

  -- 5. UN OBJET, UNE RESERVATION
  v_order := public.place_gift_order(v_b1, v_prod, 1);
  select stock into v_stock from public.products where id = v_prod;
  if v_stock <> 0 then raise exception 'ECHEC : le don n-a pas ete decremente (%)', v_stock; end if;

  begin
    perform public.place_gift_order(v_b2, v_prod, 1);
    raise exception 'DEFAUT #5 OUVERT : un SECOND acheteur a reserve le meme objet';
  exception
    when others then
      v_msg := sqlerrm;
      if v_msg <> 'OUT_OF_STOCK' then raise; end if;
  end;

  -- 6. ET L'ANNULATION POURRA RENDRE L'OBJET
  select stock_taken into v_taken from public.orders where id = v_order;
  if v_taken is not true then raise exception 'ECHEC : la commande de don ne retient pas l-objet'; end if;
  perform public.restore_order_stock(v_order);
  select stock into v_stock from public.products where id = v_prod;
  if v_stock <> 1 then raise exception 'ECHEC : l-annulation n-a pas rendu l-objet (%)', v_stock; end if;

  raise notice 'un don se reserve exactement autant de fois qu-il y a d-objets';
end
$t$;

rollback;
