-- ===========================================================================
-- UN DON N'A PAS DE DÉCLINAISONS
-- 2026-09-28 · suite immédiate de 20260928_01
-- ===========================================================================
--
-- CE QUI EST CASSÉ AUJOURD'HUI. Rien n'empêche `products.is_gift` et
-- `products.has_variants` d'être vrais ensemble, et le formulaire y mène tout
-- seul : le vendeur remplit ses tailles, puis cache la matrice en cochant
-- « À donner » — l'état survit à la bascule, et les deux partent au serveur.
--
-- CE QUE ÇA COÛTERAIT. `place_gift_order` ne connaît pas les combinaisons :
-- elle décrémente `products.stock`, qui sur une annonce à déclinaisons est un
-- AGRÉGAT recalculé depuis les lignes filles. Le don serait donc pris sans
-- qu'aucune combinaison ne baisse, et la remontée rétablirait aussitôt le stock
-- d'origine : le même article se donnerait indéfiniment. Personne ne perd
-- d'argent — un don n'en porte pas — mais le donneur se retrouverait avec dix
-- personnes venues chercher la même paire.
--
-- POURQUOI EN BASE ET PAS DANS L'APPLI. Le correctif côté téléphone est déjà
-- posé (create/preview et product/edit n'envoient plus la matrice pour un don),
-- mais une règle qu'un appel d'API contourne n'est pas une règle. La contrainte
-- ci-dessous ferme les DEUX portes d'un coup : cocher « à donner » sur une
-- annonce à déclinaisons, et ajouter des déclinaisons à un don.

begin;

-- ---------------------------------------------------------------------------
-- 1. L'ÉTAT DES LIEUX, AVANT DE POSER LA CONTRAINTE
-- ---------------------------------------------------------------------------
-- Si des lignes violent déjà la règle, l'ALTER échoue et cette migration
-- s'annule en entier. Le compte est dit d'abord, pour savoir quoi corriger.
do $audit$
declare n int;
begin
  select count(*) into n from public.products where is_gift and has_variants;
  if n > 0 then
    raise warning 'A CORRIGER A LA MAIN : % annonce(s) sont a la fois un don ET a declinaisons', n;
  else
    raise notice 'aucune annonce ne cumule don et declinaisons : la contrainte peut etre posee';
  end if;
end
$audit$;

alter table public.products
  drop constraint if exists products_gift_has_no_variants;
alter table public.products
  add constraint products_gift_has_no_variants
  check (not (is_gift and has_variants));

-- ---------------------------------------------------------------------------
-- 2. LE REFUS NOMMÉ, AVANT LA CONTRAINTE
-- ---------------------------------------------------------------------------
-- La contrainte suffit à protéger la base, mais son message est illisible pour
-- un vendeur. `replace_product_variants` refuse donc d'abord avec un nom que
-- la fonction edge sait traduire.
--
-- Corps recopié de 20260928_01 à l'identique, hors la garde ajoutée : cette
-- fonction a été créée par ce fichier et n'a subi aucune chirurgie depuis, donc
-- le corps déployé et le corps du dépôt sont les mêmes.
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
  v_gift  boolean;
  v_count int := coalesce(jsonb_array_length(p_variants), 0);
begin
  -- LA LIGNE PRODUIT D'ABORD, LES LIGNES FILLES ENSUITE. C'est l'ordre de
  -- verrouillage des deux fonctions de commande ; l'inverser ici suffirait a
  -- provoquer un interblocage sur le chemin de paiement.
  select has_variants, is_gift into v_had, v_gift
    from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if v_count > 20 then raise exception 'TOO_MANY_VARIANTS'; end if;

  -- UN DON NE SE DECLINE PAS. place_gift_order decremente products.stock, qui
  -- sur une annonce a declinaisons est un agregat : le don se redonnerait sans
  -- fin. On refuse ici, ou le message peut encore etre traduit.
  if v_gift and v_count > 0 then raise exception 'GIFT_HAS_NO_VARIANTS'; end if;

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

-- Le durcissement du 2026-07-29 : Supabase re-accorde EXECUTE a `authenticated`
-- par defaut, et l'appli ne passe jamais par les RPC en direct.
revoke all on function public.replace_product_variants(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_product_variants(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. CONTRÔLE
-- ---------------------------------------------------------------------------
do $check$
declare
  v_src text;
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'products_gift_has_no_variants'
       and conrelid = 'public.products'::regclass
  ) then
    raise exception 'la contrainte products_gift_has_no_variants n''est pas posee';
  end if;

  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'replace_product_variants' limit 1;

  -- Les gardes que ce remplacement ne doit pas avoir fait disparaitre.
  if position('GIFT_HAS_NO_VARIANTS' in v_src) = 0 then raise exception 'garde don perdue'; end if;
  if position('LIVE_ORDERS' in v_src) = 0          then raise exception 'garde LIVE_ORDERS perdue'; end if;
  if position('TOO_MANY_VARIANTS' in v_src) = 0    then raise exception 'garde TOO_MANY_VARIANTS perdue'; end if;
  if position('for update' in v_src) = 0           then raise exception 'verrou produit perdu'; end if;

  raise notice 'un don ne peut plus se decliner, ni dans la fonction ni dans la table';
end
$check$;

commit;
