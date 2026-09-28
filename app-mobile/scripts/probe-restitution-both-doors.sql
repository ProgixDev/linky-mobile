-- ===========================================================================
-- SONDE : la restitution n'invente pas d'unités, PAR L'UNE COMME PAR L'AUTRE
--         des deux portes (seconde moitié de #12)
-- ===========================================================================
--
-- POURQUOI CETTE SONDE EXISTE, ET C'EST UN AVEU. La sonde
-- `probe-stock-taken-per-line.sql` est verte depuis 20260929_05 : elle appelle
-- `restore_order_stock`. Sauf qu'il y a DEUX chemins de restitution, et elle
-- frappait à la bonne porte du mauvais mur :
--
--   • `refund_order_to_buyer` appelle `restore_order_stock` ;
--   • TOUT passage d'une commande en `cancelled` / `refunded` déclenche
--     `trg_restore_stock_on_order_cancel`, qui RÉIMPLÉMENTAIT la restitution —
--     sans le filtre `oi.stock_taken`.
--
-- Mesure du 2026-09-28 : la scène de #12 annulée par un changement de status
-- rendait la combinaison à 3 au lieu de 2. Le défaut était toujours vivant sur
-- le chemin réel.
--
-- Depuis 20260929_07 les deux appelants délèguent à `restore_order_stock_lines`,
-- seul endroit où la restitution est écrite. Cette sonde frappe aux DEUX portes.
--
-- SON CONTRÔLE NÉGATIF EST GRATUIT : lancée avant 20260929_07, elle échoue à la
-- porte du DÉCLENCHEUR (« le declencheur invente du stock : A rendu a 3 »).
--
-- ┌─ CE QU'ELLE NE PROUVE PAS, ET IL FAUT LE DIRE ──────────────────────────┐
-- #10 (l'ordre de verrouillage) n'est PAS vérifiable ici : il faudrait deux
-- sessions concurrentes qui se croisent, ce qu'un aller-retour SQL ne permet
-- pas. Ce que la migration vérifie, c'est que le préambule prend bien les lignes
-- PRODUIT d'abord et dans l'ordre des identifiants — le même ordre que
-- `replace_product_variants` et que les deux fonctions de commande. C'est une
-- vérification de forme, assumée comme telle.
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- COMMENT LA LANCER : éditeur SQL Supabase, ou POST .../database/query. Elle se
-- termine par `rollback` — rien ne subsiste. Elle EMPRUNTE un vrai vendeur et un
-- vrai acheteur : c'est le rollback qui rend cela sans danger. Ne jamais en faire
-- une migration, ne jamais remplacer sa dernière ligne par `commit`.
-- ===========================================================================

begin;

do $t$
declare
  v_shop uuid; v_seller uuid; v_buyer uuid;
  v_prod uuid; v_va uuid; v_vb uuid; v_order uuid;
  v_a int; v_b int; v_taken boolean;
begin
  select s.id, s.owner_id into v_shop, v_seller
    from public.shops s where s.kind = 'shop' order by s.created_at limit 1;
  select id into v_buyer from public.users where id <> v_seller limit 1;
  if v_shop is null or v_buyer is null then raise exception 'pas de jeu de donnees'; end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- PORTE 1 : LE DECLENCHEUR (le chemin reel d'une annulation)
  -- ══════════════════════════════════════════════════════════════════════
  insert into public.products (shop_id, title, price_minor, category, condition, city, status, has_variants, stock)
    values (v_shop, 'SONDE 2 portes A - a supprimer', 1000, 'mode', 'neuf', 'Conakry', 'active', true, null)
    returning id into v_prod;
  insert into public.product_variants (product_id, size, color, stock, status, position)
    values (v_prod, '41', 'Noire', null, 'active', 0) returning id into v_va;
  insert into public.product_variants (product_id, size, color, stock, status, position)
    values (v_prod, '44', 'Noire', 5, 'active', 1) returning id into v_vb;

  v_order := public.place_order_multi(v_buyer, jsonb_build_array(
      jsonb_build_object('product_id', v_prod, 'variant_id', v_va, 'quantity', 1),
      jsonb_build_object('product_id', v_prod, 'variant_id', v_vb, 'quantity', 1)),
    'orange-money', 'pickup', 0);

  update public.product_variants set stock = 2 where id = v_va;

  -- L'ANNULATION TELLE QUE L'APPLICATION LA FAIT : un changement de status.
  update public.orders set status = 'cancelled' where id = v_order;

  select stock into v_a from public.product_variants where id = v_va;
  select stock into v_b from public.product_variants where id = v_vb;
  if v_a <> 2 then
    raise exception 'LE DECLENCHEUR INVENTE DU STOCK : A rendu a % au lieu de 2', v_a;
  end if;
  if v_b <> 5 then raise exception 'LE DECLENCHEUR n-a pas restitue B (%)', v_b; end if;

  -- Et il a bien pose le marqueur d'idempotence, sinon un second passage
  -- rendrait une deuxieme fois.
  select stock_taken into v_taken from public.orders where id = v_order;
  if v_taken is not false then raise exception 'le declencheur n-a pas pose stock_taken'; end if;
  perform public.restore_order_stock(v_order);
  select stock into v_b from public.product_variants where id = v_vb;
  if v_b <> 5 then raise exception 'double restitution apres le declencheur (%)', v_b; end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- PORTE 2 : L'APPEL DIRECT (le chemin de refund_order_to_buyer)
  -- ══════════════════════════════════════════════════════════════════════
  insert into public.products (shop_id, title, price_minor, category, condition, city, status, has_variants, stock)
    values (v_shop, 'SONDE 2 portes B - a supprimer', 1000, 'mode', 'neuf', 'Conakry', 'active', true, null)
    returning id into v_prod;
  insert into public.product_variants (product_id, size, color, stock, status, position)
    values (v_prod, '41', 'Noire', null, 'active', 0) returning id into v_va;
  insert into public.product_variants (product_id, size, color, stock, status, position)
    values (v_prod, '44', 'Noire', 5, 'active', 1) returning id into v_vb;

  v_order := public.place_order_multi(v_buyer, jsonb_build_array(
      jsonb_build_object('product_id', v_prod, 'variant_id', v_va, 'quantity', 1),
      jsonb_build_object('product_id', v_prod, 'variant_id', v_vb, 'quantity', 1)),
    'orange-money', 'pickup', 0);

  update public.product_variants set stock = 2 where id = v_va;
  perform public.restore_order_stock(v_order);

  select stock into v_a from public.product_variants where id = v_va;
  select stock into v_b from public.product_variants where id = v_vb;
  if v_a <> 2 then
    raise exception 'L-APPEL DIRECT INVENTE DU STOCK : A rendu a % au lieu de 2', v_a;
  end if;
  if v_b <> 5 then raise exception 'L-APPEL DIRECT n-a pas restitue B (%)', v_b; end if;

  -- Et le declencheur, qui s'executera ensuite quand la commande passera en
  -- 'refunded', ne doit RIEN rendre de plus : c'est `old.stock_taken` deja faux
  -- qui l'en empeche, et c'est exactement ce qui fait tenir l'ordre choisi par
  -- refund_order_to_buyer (restituer PUIS changer le status).
  update public.orders set status = 'refunded' where id = v_order;
  select stock into v_b from public.product_variants where id = v_vb;
  if v_b <> 5 then raise exception 'double restitution apres l-appel direct (%)', v_b; end if;

  raise notice 'les deux portes rendent la meme chose, et ne rendent qu-une fois';
end
$t$;

rollback;
