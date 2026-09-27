-- « À DONNER » — un article cede gratuitement, qui traverse l'application sans
-- qu'un seul franc bouge.
--
-- Demande du client, 2026-09-26 : « Une option "A donner" qui renvoie a 0 GNF. »
--
-- ┌─ POURQUOI CE N'EST PAS « UN PRIX A ZERO » ───────────────────────────────┐
-- Parce que zero traverse toute la chaine monetaire et y est refuse a chaque
-- etage : post_transfer leve INVALID_AMOUNT sur un montant nul
-- (20260923_03:55), ledger_entries.amount_minor porte un CHECK > 0, et
-- payment_intents aussi. Une commande gratuite ne peut donc PAS emprunter le
-- chemin normal : elle doit le contourner entierement.
--
-- C'est exactement ce que le projet a deja valide le 2026-09-24 pour le
-- paiement a la livraison : un moyen de paiement dedie, une cloture dediee qui
-- n'ecrit aucune ligne comptable, et des gardes sur TOUTES les portes de
-- sortie d'argent. On recopie ce patron plutot que d'en inventer un second.
--
-- LE SEQUESTRE EST POOLE : post_transfer ne verifie que le solde GLOBAL du
-- portefeuille. Une seule porte oubliee suffirait a faire sortir de l'argent
-- qui n'y est jamais entre — celui des autres acheteurs.
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- PRE-VOL, a lancer AVANT ce fichier. Doit rendre 0 :
--   select count(*) from public.products where price_minor <= 0;
-- L'API refuse price_minor <= 0 depuis toujours (product-create:42), mais la
-- base l'autorise (20260529_03:36) : une ligne de test ferait echouer la
-- validation de la contrainte au milieu du fichier.

-- ===========================================================================
-- 1. LE DRAPEAU, VERROUILLE AU PRIX DANS LES DEUX SENS
-- ===========================================================================
-- Un booleen et pas seulement « price_minor = 0 » : zero est deja la sentinelle
-- « champ non saisi » du brouillon de creation, ET la sentinelle « aucun
-- filtre » dans la feuille de filtres du Marche. Sans drapeau explicite, un
-- article a donner serait indistinguable d'un formulaire a moitie rempli.
alter table public.products
  add column if not exists is_gift boolean not null default false;

alter table public.products
  drop constraint if exists products_gift_price_check;
alter table public.products
  add constraint products_gift_price_check check (
        (is_gift     and price_minor = 0)
     or (not is_gift and price_minor > 0)
  );
-- STRICTEMENT PLUS FORTE que l'ancienne price_minor >= 0 : le zero
-- « accidentel » que la base tolerait depuis le 2026-05-29 devient impossible.
-- Les deux contraintes cohabitent ; c'est CELLE-CI qu'il faudra rouvrir le jour
-- ou une declinaison aura son propre prix.

comment on column public.products.is_gift is
  'Article a donner. Verrouille a price_minor = 0 par products_gift_price_check. '
  'Une commande qui le porte est FORCEE en payment_method = ''gift'' : aucune '
  'intention de paiement, aucune ecriture au grand livre, cloture par '
  'confirm_gift_order_receipt.';

-- Le filtre « À donner » du Marche, sans jointure ni RPC.
create index if not exists products_gift_active_idx
  on public.products (created_at desc) where is_gift and status = 'active';

-- ===========================================================================
-- 2. LE MOYEN DE PAIEMENT 'gift'
-- ===========================================================================
-- La liste est RELUE DU CATALOGUE et non retapee de memoire : elle s'est
-- allongee six fois depuis mai (kulu, soutramoney, paycard, cod...) et une
-- valeur oubliee rendrait tout un rail inutilisable sans prevenir.
do $pm$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.orders'::regclass
     and conname = 'orders_payment_method_check';

  if v_def is null then
    raise exception 'orders_payment_method_check introuvable — schema inattendu';
  end if;

  if position('''gift''' in v_def) > 0 then
    raise notice '''gift'' deja autorise — rien a faire';
    return;
  end if;

  -- 'cod' est le dernier ajout (2026-09-24) et sert d'ancre : on insere apres
  -- lui plutot que de reconstruire la liste.
  if position('''cod''' in v_def) = 0 then
    raise exception 'ancre ''cod'' absente de orders_payment_method_check — relire avant de forcer';
  end if;

  execute 'alter table public.orders drop constraint orders_payment_method_check';
  execute 'alter table public.orders add constraint orders_payment_method_check '
       || replace(v_def, '''cod''::text', '''cod''::text, ''gift''::text');
  raise notice 'moyen de paiement ''gift'' autorise';
end
$pm$;

-- ===========================================================================
-- 3. UN DON EST GRATUIT, ET EN RETRAIT, SUR TOUTES SES COLONNES D'ARGENT
-- ===========================================================================
-- LE RETRAIT EST OBLIGATOIRE, et ce n'est pas une simplification : une
-- livraison coute au minimum 15 000 GNF, et il faudrait bien que QUELQU'UN les
-- paie. Faire payer un acheteur pour un objet gratuit, c'est le litige assure ;
-- les faire payer au donneur, c'est lui faire payer pour donner. Le don se
-- remet en main propre, avec le QR comme preuve.
alter table public.orders
  drop constraint if exists orders_gift_is_free_pickup;
alter table public.orders
  add constraint orders_gift_is_free_pickup check (
    payment_method <> 'gift' or (
          delivery_mode      = 'pickup'
      and amount_minor       = 0
      and fees_minor         = 0
      and total_minor        = 0
    )
  );
-- Note : delivery_fee_minor n'est pas cite ici volontairement — la colonne
-- existe depuis 20260730_01 avec un defaut a 0, et l'ajouter ferait echouer la
-- contrainte sur d'eventuelles lignes historiques sans qu'aucun don n'existe
-- encore. Le retrait force suffit : place_order_multi ne calcule aucun frais
-- de livraison sur un retrait.

-- ===========================================================================
-- 4. LA CLOTURE D'UN DON : ZERO MOUVEMENT COMPTABLE
-- ===========================================================================
-- Copie du patron de confirm_cod_order_receipt (20260924_02), la seule cloture
-- du projet qui n'ecrit aucune ligne au grand livre. On recopie plutot que
-- d'inventer : ce patron tourne en production depuis le 2026-09-24.
--
-- LE CALLER PEUT ETRE L'ACHETEUR OU LE VENDEUR, et c'est necessaire : depuis
-- l'inversion du QR du 2026-08-22, sur un RETRAIT c'est le VENDEUR qui scanne
-- le code affiche par l'acheteur. L'ecran de confirmation route sur le role
-- (app/order/[id]/confirm.tsx). Un don etant en retrait obligatoire, une
-- cloture reservee a l'acheteur serait inatteignable — le don ne pourrait etre
-- remis par personne.
create or replace function public.confirm_gift_order_receipt(
  p_order_id   uuid,
  p_caller_id  uuid,
  p_scan_token text
) returns void
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_order record;
begin
  select o.id, o.buyer_id, o.seller_id, o.status, o.events,
         o.scan_token, o.payment_method
    into v_order
    from public.orders o
   where o.id = p_order_id
   for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_method <> 'gift' then raise exception 'NOT_GIFT_ORDER'; end if;
  if p_caller_id <> v_order.buyer_id and p_caller_id <> v_order.seller_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_order.scan_token is null or v_order.scan_token <> p_scan_token then
    raise exception 'INVALID_SCAN_TOKEN';
  end if;
  if v_order.status not in ('paid', 'preparing', 'delivered') then
    raise exception 'INVALID_STATUS';
  end if;

  -- AUCUN post_transfer. AUCUNE ligne de grand livre. C'est tout l'interet.
  update public.orders
     set status     = 'released',
         events     = coalesce(events, '[]'::jsonb)
                      || jsonb_build_array(jsonb_build_object(
                           'at', now(), 'label', 'Don remis')),
         updated_at = now()
   where id = p_order_id;
end
$fn$;

revoke all on function public.confirm_gift_order_receipt(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_gift_order_receipt(uuid, uuid, text)
  to service_role;

-- ===========================================================================
-- 5. LES SIX SORTIES D'ARGENT REFUSENT UN DON
-- ===========================================================================
-- Chirurgie sur les corps DEPLOYES, jamais depuis un fichier du depot : les
-- migrations 20260924_05 et _06 ont reecrit dix-sept corps EN PLACE pour la
-- separation des caisses Vendeur/Immo. Partir du fichier restaurerait la
-- version d'avant les caisses — c'est ainsi que la garde de stock de
-- place_order_multi a disparu six semaines sans que personne ne le voie.
--
-- DEUX FORMES D'ANCRE coexistent dans ces six fonctions :
--   A. les quatre fonctions de commande   : ORDER_NOT_FOUND en majuscules
--   B. refund_order_to_buyer et admin_force_resolve_order : order_not_found
--      en minuscules, avec `using errcode`
-- On essaie les deux et on REFUSE si aucune ne correspond, plutot que de
-- laisser une porte ouverte en silence.
do $guards$
declare
  r          text;
  v_src      text;
  v_anchor_a constant text := 'if not found then raise exception ''ORDER_NOT_FOUND''; end if;';
  v_anchor_b constant text := 'raise exception ''order_not_found'' using errcode = ''P0002'';';
  v_anchor   text;
  v_guard    text;
  v_done     int := 0;
begin
  foreach r in array array[
    'confirm_order_receipt',
    'seller_confirm_pickup',
    'livreur_confirm_handoff',
    'resolve_dispute',
    'refund_order_to_buyer',
    'admin_force_resolve_order'
  ]
  loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r
     limit 1;

    if v_src is null then
      raise exception '% introuvable — schema inattendu', r;
    end if;

    if position('GIFT_ORDER' in v_src) > 0 then
      raise notice '% porte deja la garde du don', r;
      continue;
    end if;

    -- La garde interroge la table plutot qu'une variable locale : les noms de
    -- variables different d'une fonction a l'autre, pas la colonne.
    if position('p_order_id' in v_src) = 0 then
      raise exception '% n''a pas de parametre p_order_id — garde impossible', r;
    end if;

    v_anchor := case
                  when position(v_anchor_a in v_src) > 0 then v_anchor_a
                  when position(v_anchor_b in v_src) > 0 then v_anchor_b
                  else null
                end;
    if v_anchor is null then
      raise exception '% : aucune ancre reconnue — relire le corps deploye avant de forcer', r;
    end if;

    v_guard := v_anchor || '
  -- DON : cette commande n''a JAMAIS rien depose au sequestre, qui est POOLE.
  -- Toute sortie d''argent ici prendrait celui des AUTRES acheteurs. La seule
  -- cloture valable est confirm_gift_order_receipt, qui n''ecrit aucune ligne
  -- au grand livre.
  if (select payment_method from public.orders where id = p_order_id) = ''gift'' then
    raise exception ''GIFT_ORDER'';
  end if;';

    execute replace(v_src, v_anchor, v_guard);
    v_done := v_done + 1;
  end loop;

  raise notice 'garde du don posee sur % fonction(s)', v_done;
end
$guards$;

-- Supabase re-accorde EXECUTE a chaque recreation d'une SECURITY DEFINER : le
-- durcissement du 2026-07-29 doit etre re-pose, sinon un client peut appeler
-- ces fonctions directement.
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('confirm_order_receipt', 'seller_confirm_pickup',
                         'livreur_confirm_handoff', 'resolve_dispute',
                         'refund_order_to_buyer', 'admin_force_resolve_order',
                         'confirm_gift_order_receipt')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$grants$;

-- ===========================================================================
-- 6. LE CHEMIN DE COMMANDE D'UN DON
-- ===========================================================================
-- UNE FONCTION A PART, ET PAS UNE BRANCHE DANS place_order_multi. Deux raisons.
--
-- La premiere est le RISQUE : place_order_multi porte l'argent de TOUTES les
-- commandes et vient d'etre reecrite hier pour retrouver sa garde de stock. La
-- retoucher une seconde fois en deux jours, c'est exactement le chemin par
-- lequel cette garde avait disparu. Ici, un defaut ne peut toucher que les
-- dons — qui n'existent pas encore.
--
-- La seconde est la DECISION : c'est le SERVEUR qui doit decider qu'une
-- commande est un don, en lisant products.is_gift, jamais le client en
-- proposant un moyen de paiement. La fonction edge choisit ce chemin APRES
-- avoir lu la base ; rien de ce que le telephone envoie ne peut transformer un
-- article payant en don, ni l'inverse.
create or replace function public.place_gift_order(
  p_buyer_id   uuid,
  p_product_id uuid,
  p_quantity   int default 1
) returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_product  record;
  v_order_id uuid;
  v_snapshot jsonb;
  v_now      timestamptz := now();
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'INVALID_QUANTITY';
  end if;

  -- `for update of p` : la ligne produit est verrouillee, donc deux preneurs
  -- simultanes du dernier exemplaire se serialisent ici. Meme mecanique que
  -- les deux autres chemins de commande.
  select p.id, p.shop_id, p.title, p.photos, p.status, p.stock, p.is_gift,
         s.owner_id
    into v_product
    from public.products p
    join public.shops s on s.id = p.shop_id
   where p.id = p_product_id
   for update of p;

  if not found                       then raise exception 'PRODUCT_NOT_FOUND'; end if;
  -- Relu de la BASE, pas du corps de la requete : c'est ce qui empeche de faire
  -- passer un article payant pour un don.
  if not v_product.is_gift           then raise exception 'NOT_A_GIFT'; end if;
  if v_product.status <> 'active'    then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
  if v_product.owner_id = p_buyer_id then raise exception 'BUYER_IS_SELLER'; end if;

  -- Meme garde de stock que les deux autres chemins : un don en quantite
  -- limitee se surviendrait aussi bien qu'un article payant.
  if v_product.stock is not null then
    if v_product.stock <= 0        then raise exception 'OUT_OF_STOCK'; end if;
    if p_quantity > v_product.stock then raise exception 'INSUFFICIENT_STOCK'; end if;
    update public.products set stock = stock - p_quantity where id = v_product.id;
  end if;

  -- priceGnf a 0 dans l'instantane : ce que l'acheteur verra sur sa commande,
  -- aujourd'hui et dans deux ans, meme si le donneur remet un prix ensuite.
  v_snapshot := jsonb_build_object(
    'title',    v_product.title,
    'photo',    coalesce(v_product.photos[1], ''),
    'priceGnf', 0
  );

  insert into public.orders (
    reference, buyer_id, seller_id, shop_id, product_id,
    product_snapshot, quantity, amount_minor, fees_minor, total_minor,
    delivery_mode, delivery_fee_minor,
    payment_method, status, events, stock_taken
  ) values (
    public.generate_order_reference(), p_buyer_id, v_product.owner_id,
    v_product.shop_id, v_product.id,
    v_snapshot, p_quantity, 0, 0, 0,
    -- RETRAIT force et frais nuls : la contrainte orders_gift_is_free_pickup
    -- le reclame, et ces deux lignes disent pourquoi elle existe.
    'pickup', 0,
    'gift',
    -- DIRECTEMENT 'paid'. Il n'y a rien a encaisser : passer par 'placed'
    -- ferait entrer le don dans le balayage des paiements abandonnes, qui
    -- l'annulerait au bout de quinze minutes.
    'paid',
    jsonb_build_array(
      jsonb_build_object('at', v_now, 'label', 'Don réservé'),
      jsonb_build_object('at', v_now, 'label', 'À retirer chez le donneur')
    ),
    -- Le marqueur de stock (20260926_02) : vrai seulement si on vient
    -- reellement de retirer des unites, sinon la restitution en inventerait.
    v_product.stock is not null
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, product_snapshot, quantity, unit_price_minor, amount_minor
  ) values (
    v_order_id, v_product.id, v_snapshot, p_quantity, 0, 0
  );

  return v_order_id;
end
$fn$;

revoke all on function public.place_gift_order(uuid, uuid, int)
  from public, anon, authenticated;
grant execute on function public.place_gift_order(uuid, uuid, int) to service_role;

-- ===========================================================================
-- 7. CONTROLE
-- ===========================================================================
do $check$
declare
  v_missing text;
begin
  select string_agg(p.proname, ', ') into v_missing
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('confirm_order_receipt', 'seller_confirm_pickup',
                       'livreur_confirm_handoff', 'resolve_dispute',
                       'refund_order_to_buyer', 'admin_force_resolve_order')
     and position('GIFT_ORDER' in pg_get_functiondef(p.oid)) = 0;

  if v_missing is not null then
    raise exception 'PORTE OUVERTE : % ne refuse(nt) pas un don', v_missing;
  end if;

  -- Les caisses Vendeur/Immo doivent avoir survecu a la chirurgie.
  select string_agg(p.proname, ', ') into v_missing
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('confirm_order_receipt', 'seller_confirm_pickup',
                       'livreur_confirm_handoff', 'resolve_dispute',
                       'refund_order_to_buyer', 'admin_force_resolve_order')
     and position('kind' in pg_get_functiondef(p.oid)) = 0;
  if v_missing is not null then
    raise warning 'CAISSES : % ne mentionne(nt) plus « kind » — verifier avant de servir du trafic', v_missing;
  end if;

  raise notice 'les six sorties d''argent refusent un don';
end
$check$;
