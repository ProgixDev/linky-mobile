-- ===========================================================================
-- LA RESTITUTION N'INVENTE PLUS D'UNITÉS (trouvaille #12 de l'audit)
-- 2026-09-28
-- ===========================================================================
--
-- LE DÉFAUT. `orders.stock_taken` vaut `true` PAR DÉFAUT et les deux fonctions
-- de commande ne l'écrivent jamais. Le marqueur dit donc « cette commande
-- retient des unités » même quand elle n'en a retiré aucune.
--
-- Ce n'était pas atteignable avant les déclinaisons. Ça l'est depuis : « quantité
-- non déclarée » est devenu un état par COMBINAISON, que le formulaire propose
-- explicitement (« Vide = je ne compte pas »), et rien n'oblige une matrice à
-- être entièrement chiffrée.
--
-- LE SCÉNARIO, ÉTAPE PAR ÉTAPE :
--   1. Le vendeur saisit 41·Noire et 44·Noire sans remplir aucune quantité.
--      Les deux combinaisons ont `stock = null`.
--   2. Un acheteur commande 1 × 41·Noire. Dans la fonction de commande, la
--      branche `if v_variant.stock is not null` est FAUSSE : aucun décrément
--      n'a lieu. Mais la commande naît avec `stock_taken = true`.
--   3. Pendant la fenêtre de séquestre, le vendeur chiffre enfin sa matrice :
--      41·Noire = 2, ce qui lui reste sur l'étagère, la paire vendue étant déjà
--      partie.
--   4. La commande est annulée ou remboursée. `restore_order_stock` ne teste la
--      nullité qu'AU MOMENT DE LA RESTITUTION : 41·Noire passe à 3.
--
-- Le vendeur a deux paires, l'annonce en vend trois. La troisième commande
-- finira en litige puis en remboursement — et le stock inventé, lui, restera.
--
-- POURQUOI PAR LIGNE ET NON PAR COMMANDE. Une commande peut mélanger une ligne
-- qui a pris du stock et une qui n'en a pas pris (une combinaison chiffrée et
-- une autre laissée vide, ou un article simple et un article à déclinaisons).
-- Un marqueur par commande ne peut pas dire « celle-là, non » : il ne sait que
-- tout rendre ou ne rien rendre. `orders.stock_taken` reste, il garde son rôle
-- d'idempotence ; la VÉRITÉ de ce qui a été pris descend au niveau de la ligne.
--
-- COMMENT L'INFORMATION DESCEND. Par l'INSTANTANÉ, exactement comme la
-- déclinaison depuis 20260928_01 : la fonction de commande écrit `stockTaken`
-- dans `product_snapshot`, et le déclencheur `fill_order_item_variant` le
-- recopie dans la colonne. Aucun `INSERT ... SELECT` à toucher.
--
-- ⚠️ Le booléen est posé dans une VARIABLE et non calculé dans un `case` au
-- moment de l'instantané : plpgsql substitue les variables AVANT d'évaluer le
-- `case`, donc lire `v_variant.stock` là-bas lèverait « record is not assigned
-- yet » sur une annonce sans déclinaison — le chemin de commande de tout le
-- monde. C'est exactement le défaut corrigé le 2026-09-27 sur `v_variant_label`.

begin;

-- ---------------------------------------------------------------------------
-- 1. LE MARQUEUR, AU NIVEAU DE LA LIGNE
-- ---------------------------------------------------------------------------
-- `default true` : les lignes existantes gardent le comportement d'aujourd'hui.
-- On corrige l'avenir, on ne réécrit pas l'histoire — et une ligne ancienne qui
-- a réellement pris du stock doit continuer de le rendre.
alter table public.order_items
  add column if not exists stock_taken boolean not null default true;

comment on column public.order_items.stock_taken is
  'Cette ligne a-t-elle réellement retiré des unités ? Faux quand la cible avait '
  'une quantité non déclarée (null) au moment de la commande. Posé par le '
  'déclencheur depuis product_snapshot->>''stockTaken''. La restitution ne rend '
  'qu''aux lignes vraies, sinon elle invente du stock.';

-- ---------------------------------------------------------------------------
-- 2. LES DEUX FONCTIONS DE COMMANDE NOTENT CE QU'ELLES PRENNENT
-- ---------------------------------------------------------------------------
do $orders$
declare
  fn    text;
  v_src text;
  v_new text;
  -- Les cinq ancres, vérifiées présentes UNE fois dans chacune des deux
  -- fonctions déployées avant d'écrire ce fichier.
  a_decl  constant text := 'v_variant_label    text;';
  a_reset constant text := 'v_variant_label := null;';
  a_dec_v constant text := 'update public.product_variants set stock = stock - v_qty where id = v_variant.id;';
  a_dec_p constant text := 'update public.products set stock = stock - v_qty where id = v_product.id;';
  a_snap  constant text := '''variantLabel'', v_variant_label,';
begin
  foreach fn in array array['place_order_multi', 'place_orders_batch'] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn limit 1;
    if v_src is null then raise exception '% introuvable', fn; end if;

    if position('v_took' in v_src) > 0 then
      raise notice '% note deja ce qu''elle prend', fn;
      continue;
    end if;

    -- Chaque ancre doit être là, et une seule fois : un remplacement aveugle
    -- sur une ancre absente passerait inaperçu et laisserait la fonction à
    -- moitié corrigée.
    if (length(v_src) - length(replace(v_src, a_decl,  ''))) / length(a_decl)  <> 1 then raise exception '% : ancre DECLARE', fn; end if;
    if (length(v_src) - length(replace(v_src, a_reset, ''))) / length(a_reset) <> 1 then raise exception '% : ancre RESET', fn; end if;
    if (length(v_src) - length(replace(v_src, a_dec_v, ''))) / length(a_dec_v) <> 1 then raise exception '% : ancre DECREMENT VARIANTE', fn; end if;
    if (length(v_src) - length(replace(v_src, a_dec_p, ''))) / length(a_dec_p) <> 1 then raise exception '% : ancre DECREMENT PRODUIT', fn; end if;
    if (length(v_src) - length(replace(v_src, a_snap,  ''))) / length(a_snap)  <> 1 then raise exception '% : ancre SNAPSHOT', fn; end if;

    -- (a) la variable
    v_new := replace(v_src, a_decl, a_decl || '
  v_took             boolean;');

    -- (b) remise a zero a CHAQUE tour de boucle, au meme endroit que le libelle
    v_new := replace(v_new, a_reset, a_reset || '
    v_took := false;');

    -- (c) vrai UNIQUEMENT apres un decrement reel, dans chacune des deux
    --     branches. C'est la seule definition possible de << cette ligne a pris
    --     du stock >> : celle qui suit l'ecriture elle-meme.
    v_new := replace(v_new, a_dec_v, a_dec_v || ' v_took := true;');
    v_new := replace(v_new, a_dec_p, a_dec_p || ' v_took := true;');

    -- (d) l'instantane le transporte jusqu'a order_items, ou le declencheur le
    --     recopie dans la colonne. Rien a changer dans l'INSERT ... SELECT.
    v_new := replace(v_new, a_snap, a_snap || '
        ''stockTaken'', v_took,');

    execute v_new;
    raise notice '% : note desormais ce qu''elle prend, ligne par ligne', fn;
  end loop;
end
$orders$;

-- ---------------------------------------------------------------------------
-- 3. LE DÉCLENCHEUR RECOPIE LE MARQUEUR
-- ---------------------------------------------------------------------------
create or replace function public.fill_order_item_variant()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if new.variant_id is null then
    new.variant_id := nullif(new.product_snapshot ->> 'variantId', '')::uuid;
  end if;
  -- Absent de l'instantane = on ne touche pas a la valeur posee par la colonne
  -- (true par defaut). C'est le cas des chemins qui n'ecrivent pas la cle, dont
  -- place_gift_order, qui decremente deja correctement de son cote.
  new.stock_taken := coalesce(
    nullif(new.product_snapshot ->> 'stockTaken', '')::boolean,
    new.stock_taken
  );
  return new;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 4. LA RESTITUTION NE REND QU'AUX LIGNES QUI ONT VRAIMENT PRIS
-- ---------------------------------------------------------------------------
create or replace function public.restore_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  update public.orders
     set stock_taken = false
   where id = p_order_id and stock_taken;
  if not found then return; end if;

  update public.products p
     set stock = p.stock + agg.qty, updated_at = now()
    from (
      select oi.product_id, sum(oi.quantity)::int as qty
        from public.order_items oi
       where oi.order_id = p_order_id and oi.variant_id is null
         and oi.stock_taken
       group by oi.product_id
    ) agg
   where p.id = agg.product_id and p.stock is not null;

  -- Rendre a la declinaison declenche la remontee, qui remet products.stock
  -- d'aplomb. Une combinaison passee en 'hidden' entre-temps recoit quand meme
  -- son du : elle n'est plus comptee dans l'agregat, donc rien n'apparait, et
  -- si le vendeur la remet en vente c'est SA saisie qui fera foi.
  --
  -- `oi.stock_taken` est la correction : sans lui, une ligne dont la cible
  -- n'avait AUCUNE quantite declaree au moment de la commande se voyait rendre
  -- une unite qu'elle n'avait jamais retiree, des lors que le vendeur avait
  -- chiffre sa matrice entre-temps. Du stock invente, donc de la survente.
  update public.product_variants v
     set stock = v.stock + agg.qty
    from (
      select oi.variant_id, sum(oi.quantity)::int as qty
        from public.order_items oi
       where oi.order_id = p_order_id and oi.variant_id is not null
         and oi.stock_taken
       group by oi.variant_id
    ) agg
   where v.id = agg.variant_id and v.stock is not null;
end
$fn$;

-- Le durcissement du 2026-07-29 : Supabase re-accorde EXECUTE par defaut.
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('place_order_multi', 'place_orders_batch',
                         'restore_order_stock', 'fill_order_item_variant')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------------------
-- 5. CONTRÔLE
-- ---------------------------------------------------------------------------
do $check$
declare
  fn     text;
  v_src  text;
  g      text;
  v_miss text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='order_items' and column_name='stock_taken'
  ) then
    raise exception 'order_items.stock_taken absente';
  end if;

  foreach fn in array array['place_order_multi', 'place_orders_batch'] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn limit 1;

    v_miss := null;
    foreach g in array array[
      -- le correctif de ce fichier
      'v_took             boolean;', 'v_took := false;', 'v_took := true;', '''stockTaken'', v_took',
      -- et TOUTES les gardes qui existaient avant, une par une
      'INVALID_QUANTITY', 'PRODUCT_NOT_FOUND', 'PRODUCT_NOT_AVAILABLE',
      'DUPLICATE_ITEM', 'BUYER_IS_SELLER', 'OUT_OF_STOCK', 'INSUFFICIENT_STOCK',
      'VARIANT_REQUIRED', 'VARIANT_NOT_FOUND', 'VARIANT_UNEXPECTED',
      'stock = stock - v_qty', 'kind',
      'lower(coalesce(nullif(v_item ->> ''variant_id''', 'v_seen             text[]',
      'concat_ws(chr(32) || chr(183) || chr(32)', 'v_variant_label := null;',
      '''variantId'', v_variant_id', '''variantLabel'', v_variant_label'
    ] loop
      if position(g in v_src) = 0 then
        v_miss := coalesce(v_miss || ', ', '') || g;
      end if;
    end loop;

    -- `v_took := true;` doit apparaitre DEUX fois : une par branche de
    -- decrement. Une seule voudrait dire qu'un des deux chemins ne note rien.
    if (length(v_src) - length(replace(v_src, 'v_took := true;', ''))) / length('v_took := true;') <> 2 then
      v_miss := coalesce(v_miss || ', ', '') || 'v_took := true attendu 2 fois';
    end if;
    if position(chr(65533) in v_src) > 0 then
      v_miss := coalesce(v_miss || ', ', '') || 'CARACTERE CASSE';
    end if;

    if v_miss is not null then raise exception '% : %', fn, v_miss; end if;
  end loop;

  -- La restitution et le declencheur doivent porter le marqueur.
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='restore_order_stock' limit 1;
  -- On compte `and oi.stock_taken` et non `oi.stock_taken` seul : le second
  -- apparait aussi dans le commentaire qui explique la correction, et un
  -- controle qui compte ses propres commentaires ne controle rien.
  if (length(v_src) - length(replace(v_src, 'and oi.stock_taken', ''))) / length('and oi.stock_taken') <> 2 then
    raise exception 'restore_order_stock : le filtre doit etre sur les DEUX restitutions';
  end if;

  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='fill_order_item_variant' limit 1;
  if position('stockTaken' in v_src) = 0 then
    raise exception 'fill_order_item_variant ne recopie pas le marqueur';
  end if;

  raise notice 'la restitution ne rend plus qu''aux lignes qui ont vraiment pris des unites';
end
$check$;

commit;
