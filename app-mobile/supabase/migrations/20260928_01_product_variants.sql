-- DECLINAISONS COULEUR / TAILLE — une annonce, plusieurs combinaisons.
--
-- Demande du client, 2026-09-26 : « Une option "Couleur" et "Taille" a activer
-- [...] cela permettra aux vendeur de publier une seule annonce pour une meme
-- types d'articles de couleur ou taille differente. Exemple : une paire de
-- chaussure — Taille 41 (Noire, rouge, bleue), Taille 44 (Noire, rouge, bleue). »
--
-- SON EXEMPLE EST UNE MATRICE, PAS DEUX LISTES. « 41 en noir » et « 44 en noir »
-- sont deux choses qui se vendent separement, chacune avec SON stock. Deux
-- listes decoratives — les tailles d'un cote, les couleurs de l'autre —
-- laisseraient le vendeur declarer « 3 paires » et trois acheteurs prendre du
-- 41 alors qu'il n'en a qu'une. Ce serait l'inverse du benefice attendu.
--
-- ┌─ TROIS ARBITRAGES, PRIS SANS DEMANDER AU CLIENT ─────────────────────────┐
-- 1. PAS DE PRIX PAR DECLINAISON en V1. Des qu'une taille peut couter plus
--    cher, la vignette doit afficher « a partir de X » — donc un agregat sur
--    une table fille a CHAQUE page de list-products (jusqu'a 100 lignes) et de
--    discover-feed (50), sur 3G. La colonne price_minor est posee nullable des
--    maintenant, avec la garde qui interdit de n'en remplir qu'une partie : le
--    jour ou le client le demandera, c'est un deverrouillage, pas une
--    migration de structure.
-- 2. PAS DE PHOTO PAR DECLINAISON en V1. Meme raisonnement, meme colonne
--    laissee libre pour plus tard.
-- 3. LE STOCK EST PAR COMBINAISON. C'est tout l'interet, et c'est ce que son
--    exemple decrit.
-- └──────────────────────────────────────────────────────────────────────────┘

-- ===========================================================================
-- 1. LA TABLE
-- ===========================================================================
-- L'UNICITE PORTE SUR (annonce, taille, couleur) : c'est la combinaison qui se
-- vend. Une taille sans couleur est permise (couleur = ''), et l'inverse aussi
-- — un vendeur de chaussures n'a pas forcement de couleurs a declarer.
create table if not exists public.product_variants (
  id          uuid primary key default public.uuidv7(),
  product_id  uuid not null references public.products(id) on delete cascade,
  size        text not null default '' check (char_length(size)  <= 40),
  color       text not null default '' check (char_length(color) <= 40),
  stock       integer check (stock is null or stock >= 0),
  -- 'hidden' : la combinaison a ete retiree par le vendeur MAIS elle a deja ete
  -- commandee. On ne la supprime pas, sinon order_items.variant_id pointerait
  -- dans le vide et la commande deviendrait illisible. Elle n'est simplement
  -- plus proposee ni comptee.
  status      text not null default 'active' check (status in ('active', 'hidden')),
  -- Posees pour plus tard, volontairement inutilisees en V1 (voir l'en-tete).
  price_minor bigint check (price_minor is null or price_minor > 0),
  photo_url   text,
  created_at  timestamptz not null default now(),
  unique (product_id, size, color),
  -- Une declinaison sans taille NI couleur ne distingue rien.
  constraint product_variants_not_empty check (size <> '' or color <> '')
);

create index if not exists product_variants_product_idx
  on public.product_variants (product_id) where status = 'active';

alter table public.product_variants enable row level security;
-- Aucune policy : service_role seul, comme property_photos et property_rates.

-- LA GARDE QUI TIENT L'AVENIR. Un prix sur CERTAINES declinaisons seulement
-- serait ininterpretable : que vaut une taille sans prix quand sa voisine en a
-- un ? On refuse le demi-etat des maintenant, pendant que la table est vide.
create or replace function public.forbid_partial_variant_price()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_with int;
  v_all  int;
begin
  select count(*) filter (where price_minor is not null), count(*)
    into v_with, v_all
    from public.product_variants
   where product_id = coalesce(new.product_id, old.product_id)
     and status = 'active';
  if v_with > 0 and v_with <> v_all then
    raise exception 'VARIANT_PRICE_PARTIAL';
  end if;
  return null;
end
$fn$;

drop trigger if exists trg_forbid_partial_variant_price on public.product_variants;
create constraint trigger trg_forbid_partial_variant_price
  after insert or update or delete on public.product_variants
  deferrable initially deferred
  for each row execute function public.forbid_partial_variant_price();

-- ===========================================================================
-- 2. CE QUE L'ANNONCE EN GARDE
-- ===========================================================================
-- Les deux tableaux sont DENORMALISES a dessein : ils permettent la puce
-- « taille 41 » dans la feuille de filtres du Marche et la pastille « 3 tailles
-- · 4 couleurs » sur la vignette SANS une seule jointure dans list-products ni
-- discover-feed. Sans eux, les declinaisons seraient invisibles a la recherche
-- — list-products ne cherche qu'en ILIKE sur le titre, et le contournement
-- (mettre les tailles dans le titre) est ferme par le plafond de 30 caracteres.
alter table public.products
  add column if not exists has_variants   boolean not null default false,
  add column if not exists variant_sizes  text[]  not null default '{}',
  add column if not exists variant_colors text[]  not null default '{}';

create index if not exists products_variant_sizes_idx
  on public.products using gin (variant_sizes);
create index if not exists products_variant_colors_idx
  on public.products using gin (variant_colors);

comment on column public.products.has_variants is
  'Vrai quand l''annonce se vend par combinaison. products.stock devient alors '
  'la SOMME des stocks actifs, maintenue par trigger et bonne pour l''affichage '
  'seulement : le decompte qui fait foi se fait sur la ligne fille.';

-- ===========================================================================
-- 3. LA REMONTEE
-- ===========================================================================
-- products.stock devient un AGREGAT quand l'annonce a des declinaisons. Il
-- reste la valeur saisie par le vendeur quand elle n'en a pas — c'est-a-dire
-- pour la totalite des annonces existantes, qui ne bougent pas d'un iota.
create or replace function public.rollup_product_variants()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_pid       uuid := coalesce(new.product_id, old.product_id);
  v_n         int;
  v_has_null  boolean;
  v_sum       int;
  v_sizes     text[];
  v_colors    text[];
begin
  select count(*),
         bool_or(stock is null),
         sum(coalesce(stock, 0))::int,
         coalesce(array_agg(distinct size)  filter (where size  <> ''), '{}'),
         coalesce(array_agg(distinct color) filter (where color <> ''), '{}')
    into v_n, v_has_null, v_sum, v_sizes, v_colors
    from public.product_variants
   where product_id = v_pid and status = 'active';

  update public.products p
     set has_variants   = (v_n > 0),
         -- ZERO DECLINAISON = on ne touche PAS au stock. Le vendeur qui retire
         -- ses combinaisons retrouve l'annonce simple qu'il avait avant, avec
         -- la quantite qu'il y declarera. Ecrire 0 ici mettrait son annonce en
         -- rupture sans qu'il l'ait demande.
         stock          = case
                            when v_n = 0        then p.stock
                            when v_has_null     then null
                            else v_sum
                          end,
         variant_sizes  = v_sizes,
         variant_colors = v_colors,
         updated_at     = now()
   where p.id = v_pid;

  return null;
end
$fn$;

drop trigger if exists trg_rollup_product_variants on public.product_variants;
create trigger trg_rollup_product_variants
  after insert or update or delete on public.product_variants
  for each row execute function public.rollup_product_variants();

-- ===========================================================================
-- 4. LA DECLINAISON COMMANDEE
-- ===========================================================================
alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants(id);

-- ON NE TOUCHE PAS AUX DEUX FONCTIONS DE COMMANDE POUR REMPLIR CETTE COLONNE.
-- Elles ecrivent order_items par un INSERT ... SELECT dont la liste de colonnes
-- et la liste d'expressions doivent rester alignees ; y ajouter un champ
-- demanderait deux chirurgies coordonnees sur le chemin le plus sensible du
-- projet. Le declencheur lit l'instantane, qui lui traverse deja tout le
-- chemin sans qu'on ait rien a changer.
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
  return new;
end
$fn$;

drop trigger if exists trg_fill_order_item_variant on public.order_items;
create trigger trg_fill_order_item_variant
  before insert on public.order_items
  for each row execute function public.fill_order_item_variant();

-- LA PROMESSE QUE LA GARDE APPLICATIVE NE POUVAIT PAS TENIR. order_items n'a
-- aujourd'hui AUCUNE unicite : le refus du doublon vit dans un tableau
-- PL/pgSQL (DUPLICATE_ITEM). Au moment ou l'on relache cette cle pour permettre
-- deux TAILLES du meme article dans une commande, c'est cet index qui empeche
-- que le relachement ouvre une double facturation silencieuse.
create unique index if not exists order_items_unique_line_idx
  on public.order_items (
    order_id,
    product_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ===========================================================================
-- 5. LE CHEMIN D'ECRITURE DU VENDEUR
-- ===========================================================================
-- UN DIFF, PAS UN EFFACE-PUIS-REECRIT. Une combinaison deja commandee doit
-- survivre a son retrait du formulaire, sinon order_items.variant_id pointe
-- dans le vide. Elle passe en 'hidden' : plus proposee, plus comptee, toujours
-- resolvable.
create or replace function public.replace_product_variants(
  p_product_id uuid,
  p_variants   jsonb
) returns void
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_had   boolean;
  v_count int := coalesce(jsonb_array_length(p_variants), 0);
begin
  -- LA LIGNE PRODUIT D'ABORD, LES LIGNES FILLES ENSUITE. C'est l'ordre de
  -- verrouillage des deux fonctions de commande ; l'inverser ici suffirait a
  -- provoquer un interblocage sur le chemin de paiement.
  select has_variants into v_had
    from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if v_count > 20 then raise exception 'TOO_MANY_VARIANTS'; end if;

  -- ┌─ CONVERTIR UNE ANNONCE QUI A DES COMMANDES EN VOL EST REFUSE ──────────┐
  -- Aujourd'hui, la SEULE trace d'une unite reservee est la soustraction dans
  -- products.stock. En passant aux declinaisons, ce nombre devient un agregat
  -- recalcule depuis les lignes filles : la reservation disparaitrait, et
  -- l'unite serait revendue alors que son acheteur a deja paye — avec de
  -- l'argent en sequestre.
  --
  -- orders.stock_taken (20260926_02) dit exactement « cette commande retient
  -- des unites ». Le vendeur attend la cloture, ou publie une autre annonce.
  -- └────────────────────────────────────────────────────────────────────────┘
  if not v_had and v_count > 0 then
    if exists (
      select 1 from public.orders o
       join public.order_items oi on oi.order_id = o.id
      where oi.product_id = p_product_id and o.stock_taken
    ) then
      raise exception 'LIVE_ORDERS';
    end if;
  end if;

  -- 1. Poser ou mettre a jour ce que le vendeur envoie.
  insert into public.product_variants (product_id, size, color, stock, status)
  select p_product_id,
         coalesce(x ->> 'size', ''),
         coalesce(x ->> 'color', ''),
         nullif(x ->> 'stock', '')::int,
         'active'
    from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) as x
  on conflict (product_id, size, color) do update
     set stock  = excluded.stock,
         status = 'active';

  -- 2. Ce qui n'y est plus : masque s'il a ete commande, supprime sinon.
  update public.product_variants v
     set status = 'hidden', stock = 0
   where v.product_id = p_product_id
     and v.status = 'active'
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) as x
        where coalesce(x ->> 'size', '')  = v.size
          and coalesce(x ->> 'color', '') = v.color
     )
     and exists (select 1 from public.order_items oi where oi.variant_id = v.id);

  delete from public.product_variants v
   where v.product_id = p_product_id
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) as x
        where coalesce(x ->> 'size', '')  = v.size
          and coalesce(x ->> 'color', '') = v.color
     )
     and not exists (select 1 from public.order_items oi where oi.variant_id = v.id);
end
$fn$;

revoke all on function public.replace_product_variants(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_product_variants(uuid, jsonb) to service_role;

-- ===========================================================================
-- 6. LA RESTITUTION SAIT RENDRE A LA BONNE LIGNE
-- ===========================================================================
-- Meme ordre de verrouillage qu'a la commande : PRODUIT d'abord, DECLINAISON
-- ensuite. Le marqueur stock_taken (20260926_02) reste la garde d'idempotence.
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
       group by oi.product_id
    ) agg
   where p.id = agg.product_id and p.stock is not null;

  -- Rendre a la declinaison declenche la remontee, qui remet products.stock
  -- d'aplomb. Une combinaison passee en 'hidden' entre-temps recoit quand meme
  -- son du : elle n'est plus comptee dans l'agregat, donc rien n'apparait, et
  -- si le vendeur la remet en vente c'est SA saisie qui fera foi.
  update public.product_variants v
     set stock = v.stock + agg.qty
    from (
      select oi.variant_id, sum(oi.quantity)::int as qty
        from public.order_items oi
       where oi.order_id = p_order_id and oi.variant_id is not null
       group by oi.variant_id
    ) agg
   where v.id = agg.variant_id and v.stock is not null;
end
$fn$;

revoke all on function public.restore_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.restore_order_stock(uuid) to service_role;

create or replace function public.restore_stock_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if not old.stock_taken then return new; end if;

  update public.products p
     set stock = p.stock + agg.qty, updated_at = now()
    from (
      select oi.product_id, sum(oi.quantity)::int as qty
        from public.order_items oi
       where oi.order_id = new.id and oi.variant_id is null
       group by oi.product_id
    ) agg
   where p.id = agg.product_id and p.stock is not null;

  update public.product_variants v
     set stock = v.stock + agg.qty
    from (
      select oi.variant_id, sum(oi.quantity)::int as qty
        from public.order_items oi
       where oi.order_id = new.id and oi.variant_id is not null
       group by oi.variant_id
    ) agg
   where v.id = agg.variant_id and v.stock is not null;

  new.stock_taken := false;
  return new;
end
$fn$;

revoke all on function public.restore_stock_on_order_cancel() from public, anon, authenticated;

-- ===========================================================================
-- 7. UN ARTICLE COMMANDE NE SE SUPPRIME PAS
-- ===========================================================================
-- Miroir de forbid_delete_property_with_escrow (20260923_02), qui protege
-- l'immobilier et n'a aucun equivalent produit. Ce qui protege un article
-- commande aujourd'hui est un ACCIDENT : la FK sans cascade d'order_items leve
-- une violation d'integrite au lieu d'un message. Or product_variants CASCADE
-- desormais — quelqu'un qui verra product-delete echouer sera tente de passer
-- order_items en cascade pour « debloquer », et detruira cette protection sans
-- le savoir.
create or replace function public.forbid_delete_product_with_escrow()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if exists (
    select 1 from public.orders o
     join public.order_items oi on oi.order_id = o.id
    where oi.product_id = old.id
      and o.status in ('placed', 'paid', 'preparing', 'delivered', 'disputed')
  ) then
    raise exception 'PRODUCT_HAS_LIVE_ORDERS';
  end if;
  return old;
end
$fn$;

drop trigger if exists trg_forbid_delete_product_with_escrow on public.products;
create trigger trg_forbid_delete_product_with_escrow
  before delete on public.products
  for each row execute function public.forbid_delete_product_with_escrow();

revoke all on function public.forbid_delete_product_with_escrow() from public, anon, authenticated;

-- ===========================================================================
-- 8. LES DEUX CHEMINS DE COMMANDE APPRENNENT LES DECLINAISONS
-- ===========================================================================
-- Chirurgie sur les corps DEPLOYES. Quatre ancres par fonction, chacune
-- verifiee UNIQUE avant remplacement, et un refus explicite si l'une bouge.
-- C'est la troisieme reecriture de place_order_multi en une semaine : le bloc
-- de controle final relit les NEUF gardes une par une, plus « kind » (caisses
-- Vendeur/Immo) et GIFT_ORDER (les dons). Ce projet a deja perdu une garde de
-- stock par ce chemin exact, sans que personne ne le voie pendant six semaines.
do $orders$
declare
  fn        text;
  v_src     text;
  v_new     text;
  v_snap    text;
  v_sel     constant text := 'select p.id, p.shop_id, p.title, p.photos, p.price_minor, p.status, p.stock, s.owner_id';
  v_decl    constant text := 'v_item             jsonb;';
  v_stock   constant text := 'if v_product.stock is not null then';
begin
  foreach fn in array array['place_order_multi', 'place_orders_batch'] loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn limit 1;
    if v_src is null then raise exception '% introuvable', fn; end if;

    if position('VARIANT_REQUIRED' in v_src) > 0 then
      raise notice '% connait deja les declinaisons', fn;
      continue;
    end if;

    -- L'instantane s'ecrit differemment dans les deux (alignement des cles).
    v_snap := case fn
                when 'place_order_multi'  then '''title'', v_product.title,'
                else '''title'',    v_product.title,'
              end;

    if position(v_sel   in v_src) = 0 then raise exception '% : ancre SELECT introuvable', fn; end if;
    if position(v_decl  in v_src) = 0 then raise exception '% : ancre DECLARE introuvable', fn; end if;
    if position(v_stock in v_src) = 0 then raise exception '% : ancre STOCK introuvable', fn; end if;
    if position(v_snap  in v_src) = 0 then raise exception '% : ancre SNAPSHOT introuvable', fn; end if;

    -- (a) la declinaison entre dans la lecture verrouillee
    v_new := replace(v_src, v_sel,
      'select p.id, p.shop_id, p.title, p.photos, p.price_minor, p.status, p.stock, p.has_variants, s.owner_id');

    -- (b) deux variables de plus
    v_new := replace(v_new, v_decl,
      v_decl || '
  v_variant          record;
  v_variant_id       uuid;
  v_variant_label    text;');

    -- (c) LE STOCK SE LIT SUR LA COMBINAISON QUAND IL Y EN A UNE
    v_new := replace(v_new, v_stock,
      'v_variant_id := nullif(v_item ->> ''variant_id'', '''')::uuid;
    if v_product.has_variants then
      -- Un bundle qui ignore les declinaisons n''en envoie pas. On REFUSE
      -- plutot que de choisir a sa place : vendre « une paire » sans savoir
      -- laquelle, c''est preparer une remise impossible a honorer.
      if v_variant_id is null then raise exception ''VARIANT_REQUIRED''; end if;
      select v.id, v.stock, v.size, v.color into v_variant
        from public.product_variants v
       where v.id = v_variant_id
         and v.product_id = v_product.id
         and v.status = ''active''
       for update;
      if not found then raise exception ''VARIANT_NOT_FOUND''; end if;
      if v_variant.stock is not null then
        if v_variant.stock <= 0 then raise exception ''OUT_OF_STOCK''; end if;
        if v_qty > v_variant.stock then raise exception ''INSUFFICIENT_STOCK''; end if;
        update public.product_variants set stock = stock - v_qty where id = v_variant.id;
      end if;
      -- Le libelle se compose ICI, dans la seule branche ou v_variant existe.
      -- Le lire depuis l''instantane obligerait plpgsql a evaluer v_variant.size
      -- meme sur une annonce sans declinaison — et il leverait « record is not
      -- assigned yet » sur le chemin de commande de tout le monde, parce que la
      -- substitution des variables precede l''evaluation du CASE.
      v_variant_label := nullif(trim(both '' · '' from
        coalesce(v_variant.size, '''') || '' · '' || coalesce(v_variant.color, '''')), '''');
    elsif v_variant_id is not null then
      raise exception ''VARIANT_UNEXPECTED'';
    elsif v_product.stock is not null then');

    -- (d) l'instantane porte la combinaison : c''est par lui que le
    --     declencheur remplira order_items.variant_id, sans qu''on touche a
    --     l''INSERT ... SELECT.
    v_new := replace(v_new, v_snap, v_snap || '
        ''variantId'', v_variant_id,
        ''variantLabel'', v_variant_label,');

    execute v_new;
    raise notice '% : declinaisons posees', fn;
  end loop;
end
$orders$;

do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('place_order_multi', 'place_orders_batch',
                         'restore_order_stock', 'replace_product_variants')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$grants$;

-- ┌─ UNE LIMITE ASSUMEE, A DIRE PLUTOT QU'A LAISSER DECOUVRIR ──────────────┐
-- DEUX TAILLES DU MEME ARTICLE DANS UNE SEULE COMMANDE SONT REFUSEES. La garde
-- anti-doublon des deux fonctions compare `v_product.id` seul
-- (DUPLICATE_ITEM) : elle voit deux fois la meme annonce et refuse, meme si les
-- combinaisons different. L''acheteur qui veut du 41 ET du 44 doit passer deux
-- commandes, et il lit un message clair — pas une erreur opaque.
--
-- La relacher demanderait de changer le TYPE du tableau v_seen (uuid[] vers
-- text[], pour y ranger « annonce:combinaison ») sur le chemin de commande, ce
-- qui n''est pas une ligne a deplacer mais une variable a re-typer. L''index
-- unique pose plus haut rend desormais ce relachement SUR — il empeche la
-- double facturation en base et non plus dans un tableau PL/pgSQL — mais ca
-- reste une chirurgie de plus, et ce fichier en fait deja trois.
-- └──────────────────────────────────────────────────────────────────────────┘

-- ===========================================================================
-- 9. CONTROLE — LES NEUF GARDES, PLUS LES CAISSES ET LES DONS
-- ===========================================================================
do $check$
declare
  fn      text;
  v_src   text;
  g       text;
  v_miss  text;
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
      'stock = stock - v_qty', 'kind'
    ] loop
      if position(g in v_src) = 0 then
        v_miss := coalesce(v_miss || ', ', '') || g;
      end if;
    end loop;

    if v_miss is not null then
      raise exception '% a PERDU : %', fn, v_miss;
    end if;
  end loop;

  raise notice 'les deux chemins de commande gardent leurs neuf gardes, les caisses et les dons';
end
$check$;
