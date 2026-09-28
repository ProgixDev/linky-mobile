-- ===========================================================================
-- SONDE : la restitution n'invente pas d'unites (trouvaille #12 de l'audit)
-- ===========================================================================
--
-- POURQUOI CETTE SONDE EXISTE. La migration 20260929_05 se contente de verifier
-- que le CODE a la bonne FORME (les ancres sont la, le compte est bon). Ca ne
-- dit rien du COMPORTEMENT. Cette sonde rejoue le scenario complet de l'audit
-- contre la vraie base, et echoue bruyamment si le defaut revient.
--
-- COMMENT LA LANCER. Coller dans l'editeur SQL de Supabase, ou :
--   POST https://api.supabase.com/v1/projects/<ref>/database/query
-- Elle se termine par `rollback` : RIEN ne subsiste, ni l'annonce sonde, ni la
-- commande, ni les mouvements de stock. Le seul effet durable possible est un
-- trou dans le compteur de references de commande (une sequence ne se rejoue
-- pas), ce qui est sans consequence.
--
-- CE QU'ELLE PROUVE. Une ligne dont la combinaison n'avait AUCUNE quantite
-- declaree au moment de la commande ne se voit rien rendre a l'annulation, meme
-- si le vendeur a chiffre sa matrice entre-temps. Avant le correctif, elle se
-- voyait rendre une unite jamais retiree : du stock invente, donc de la
-- survente, donc un litige puis un remboursement.
--
-- SON CONTROLE NEGATIF. Pour verifier que la sonde a des dents, inserer avant
-- l'ETAPE 3 :
--     update public.order_items set stock_taken = true
--      where order_id = v_order and variant_id = v_va;
-- Elle doit alors echouer sur << A rendu a 3 au lieu de 2 >>. Une sonde qui
-- passe dans les deux cas ne verifie rien. Mesure faite le 2026-09-28 : verte
-- telle quelle, rouge avec cette ligne.
--
-- ⚠️ Elle EMPRUNTE un vrai vendeur et un vrai acheteur au lieu d'en fabriquer,
-- parce que `users` a trop de contraintes pour un jeu d'essai jetable. C'est le
-- `rollback` qui rend ca sans danger — ne jamais transformer ce fichier en
-- migration, et ne jamais remplacer sa derniere ligne par `commit`.
-- ===========================================================================

-- PREUVE FONCTIONNELLE de #12, exactement le scenario de l'en-tete de migration.
-- Tout est dans une transaction ANNULEE : rien ne subsiste en prod.
begin;

do $t$
declare
  v_shop    uuid;
  v_seller  uuid;
  v_buyer   uuid;
  v_prod    uuid;
  v_va      uuid;   -- combinaison SANS quantite declaree (stock null)
  v_vb      uuid;   -- combinaison chiffree (stock 5)
  v_order   uuid;
  r         record;
  v_a_taken boolean; v_b_taken boolean;
  v_a_stock integer; v_b_stock integer;
begin
  -- Un vrai vendeur, un vrai acheteur : on ne fabrique pas d'utilisateur, on
  -- emprunte l'existant (et on annule tout a la fin).
  select s.id, s.owner_id into v_shop, v_seller
    from public.shops s where s.kind = 'shop' order by s.created_at limit 1;
  select u.id into v_buyer from public.users u where u.id <> v_seller limit 1;
  if v_shop is null or v_buyer is null then raise exception 'pas de jeu de donnees'; end if;

  insert into public.products (shop_id, title, price_minor, category, condition, city, status, has_variants, stock)
    values (v_shop, 'SONDE #12 - a supprimer', 1000, 'mode', 'neuf', 'Conakry', 'active', true, null)
    returning id into v_prod;

  insert into public.product_variants (product_id, size, color, stock, status, position)
    values (v_prod, '41', 'Noire', null, 'active', 0) returning id into v_va;
  insert into public.product_variants (product_id, size, color, stock, status, position)
    values (v_prod, '44', 'Noire', 5,    'active', 1) returning id into v_vb;

  -- ETAPE 2 : l'acheteur prend une paire de CHAQUE.
  v_order := public.place_order_multi(
    v_buyer,
    jsonb_build_array(
      jsonb_build_object('product_id', v_prod, 'variant_id', v_va, 'quantity', 1),
      jsonb_build_object('product_id', v_prod, 'variant_id', v_vb, 'quantity', 1)
    ),
    'orange-money', 'pickup', 0
  );

  select oi.stock_taken into v_a_taken from public.order_items oi
   where oi.order_id = v_order and oi.variant_id = v_va;
  select oi.stock_taken into v_b_taken from public.order_items oi
   where oi.order_id = v_order and oi.variant_id = v_vb;
  raise notice 'A (quantite non declaree) stock_taken = %  [attendu false]', v_a_taken;
  raise notice 'B (quantite chiffree)     stock_taken = %  [attendu true]',  v_b_taken;
  if v_a_taken is not false then raise exception 'ECHEC : la ligne A se croit preneuse de stock'; end if;
  if v_b_taken is not true  then raise exception 'ECHEC : la ligne B ne se declare pas preneuse'; end if;

  select stock into v_a_stock from public.product_variants where id = v_va;
  select stock into v_b_stock from public.product_variants where id = v_vb;
  raise notice 'apres commande : A = %  [attendu null]   B = %  [attendu 4]', v_a_stock, v_b_stock;
  if v_a_stock is not null then raise exception 'ECHEC : A a ete decremente'; end if;
  if v_b_stock <> 4        then raise exception 'ECHEC : B mal decremente (%)', v_b_stock; end if;

  -- ETAPE 3 : le vendeur chiffre enfin sa matrice PENDANT le sequestre.
  -- Il reste 2 paires en 41 sur l'etagere, celle vendue etant deja partie.
  update public.product_variants set stock = 2 where id = v_va;

  -- ETAPE 4 : la commande est annulee / remboursee.
  perform public.restore_order_stock(v_order);

  select stock into v_a_stock from public.product_variants where id = v_va;
  select stock into v_b_stock from public.product_variants where id = v_vb;
  raise notice 'apres restitution : A = %  [attendu 2, le defaut donnait 3]   B = %  [attendu 5]', v_a_stock, v_b_stock;
  if v_a_stock <> 2 then raise exception 'ECHEC #12 TOUJOURS OUVERT : A rendu a % au lieu de 2 (stock invente)', v_a_stock; end if;
  if v_b_stock <> 5 then raise exception 'ECHEC : B non restitue (%)', v_b_stock; end if;

  -- L'idempotence tient toujours : un second appel ne rend rien de plus.
  perform public.restore_order_stock(v_order);
  select stock into v_b_stock from public.product_variants where id = v_vb;
  if v_b_stock <> 5 then raise exception 'ECHEC : restitution non idempotente (%)', v_b_stock; end if;

  raise notice 'TOUT EST VERT : la restitution ne rend plus qu-aux lignes qui ont vraiment pris';
end
$t$;

rollback;
