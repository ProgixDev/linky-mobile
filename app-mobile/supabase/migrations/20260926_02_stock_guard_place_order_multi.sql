-- LE CONTROLE DE STOCK A DISPARU DU CHEMIN DE COMMANDE LE PLUS COURANT.
--
-- CE QUI SE PASSE EN PRODUCTION AUJOURD'HUI. Un panier mono-boutique — le cas
-- normal — passe par la fonction edge `place-order`, qui appelle
-- `place_order_multi`. Or cette fonction ne lit pas products.stock et ne le
-- decremente pas, alors que `place_orders_batch` le fait dans le meme fichier.
-- Deux consequences, toutes deux vivantes :
--
--   1. SURVENTE. Un vendeur qui declare 1 article peut recevoir dix commandes.
--      C'est exactement le defaut qui avait motive l'ajout du stock le
--      2026-08-13 (le client avait envoye la capture d'un panier a 7 Range
--      Rover). OUT_OF_STOCK et INSUFFICIENT_STOCK sont du code mort sur ce
--      chemin.
--   2. STOCK INVENTE. Le declencheur de restitution et `restore_order_stock`
--      rendent des unites qui n'ont jamais ete retirees. A chaque paiement
--      abandonne ou rembourse, l'inventaire du vendeur AUGMENTE.
--
-- OU C'EST PARTI. La migration 20260813_01 definissait bien place_order_multi
-- AVEC la garde (sept mentions du stock). La migration 20260908_01, qui a
-- passe la commission de 3 a 5 %, a repris les corps « deployes tels quels » —
-- et celui-la n'en portait plus aucune. La garde s'est donc perdue entre le
-- 13 aout et le 8 septembre sans que personne ne le voie, et le fichier du
-- depot enregistre desormais cette perte.
--
-- ┌─ POURQUOI DE LA CHIRURGIE ET NON UN CREATE OR REPLACE ───────────────────┐
-- Parce que le fichier du depot est PERIME par rapport a la production. Les
-- migrations 20260924_05 et 20260924_06 ont patche les corps DEPLOYES par
-- substitution de texte pour la separation des caisses Vendeur/Immo. Recrire
-- place_order_multi depuis 20260908_01 restaurerait la version d'avant les
-- caisses et reintroduirait le defaut « tout lookup de portefeuille sans kind
-- prend une ligne AU HASARD ». On repart donc de pg_get_functiondef, c'est-a-
-- dire de ce qui tourne vraiment, et on n'y touche que ce qu'on vient corriger.
-- Meme technique que 20260924_03.
-- └──────────────────────────────────────────────────────────────────────────┘

-- ===========================================================================
-- 1. LE MARQUEUR — « cette commande a-t-elle retire du stock ? »
-- ===========================================================================
-- Remettre le decrement ne suffit pas : les commandes DEJA EN VOL n'ont rien
-- retire, et la restitution leur rendrait quand meme de la marchandise. Le
-- defaut ne serait pas corrige, il serait deplace sur le carnet existant.
--
-- Une colonne booleenne tranche la question sans ambiguite, et elle rend la
-- restitution IDEMPOTENTE : on ne rend que ce qui a ete pris, et une seule
-- fois. C'est ce qui permet ensuite d'elargir le declencheur sans risque.
alter table public.orders
  add column if not exists stock_taken boolean not null default true;

comment on column public.orders.stock_taken is
  'Vrai tant que cette commande retient des unites du stock du vendeur. Pose a '
  'la creation par les fonctions qui decrementent, remis a faux par la '
  'restitution. C''est la garde d''idempotence : sans lui, rendre le stock deux '
  'fois inventerait de la marchandise.';

-- Reprise de l'existant. `batch_id` est l'unique marque du chemin qui
-- decrementait reellement : place_orders_batch le pose, place_order_multi ne
-- le connait meme pas. Une commande deja annulee ou remboursee ne retient plus
-- rien, quelle que soit sa provenance.
update public.orders
   set stock_taken = (batch_id is not null and status not in ('cancelled', 'refunded'));

-- ===========================================================================
-- 2. LA GARDE, REPOSEE SUR place_order_multi
-- ===========================================================================
do $mig$
declare
  v_src text;
  v_new text;
  v_anchor_select constant text := 'p.price_minor, p.status, s.owner_id';
  v_anchor_guard  constant text := 'raise exception ''PRODUCT_NOT_AVAILABLE''; end if;';
  v_block         constant text :=
    'raise exception ''PRODUCT_NOT_AVAILABLE''; end if;' || E'\n\n' ||
    '    -- STOCK. Meme corps que place_orders_batch, et au meme endroit : la' || E'\n' ||
    '    -- ligne produit est DEJA verrouillee par le `for update of p` ci-dessus,' || E'\n' ||
    '    -- donc deux acheteurs simultanes se serialisent ici et le second voit' || E'\n' ||
    '    -- le stock deja decremente. C''est le verrou qui fait la garde ; la' || E'\n' ||
    '    -- lecture seule ne suffirait pas.' || E'\n' ||
    '    -- stock null = quantite non declaree par le vendeur : aucune limite, et' || E'\n' ||
    '    -- rien a rendre non plus (la restitution filtre pareil).' || E'\n' ||
    '    if v_product.stock is not null then' || E'\n' ||
    '      if v_product.stock <= 0 then raise exception ''OUT_OF_STOCK''; end if;' || E'\n' ||
    '      if v_qty > v_product.stock then raise exception ''INSUFFICIENT_STOCK''; end if;' || E'\n' ||
    '      update public.products set stock = stock - v_qty where id = v_product.id;' || E'\n' ||
    '    end if;';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order_multi'
   limit 1;

  if v_src is null then
    raise exception 'place_order_multi introuvable : rien a corriger, verifier le schema';
  end if;

  -- Deja corrigee : la migration est rejouable sans effet.
  if position('OUT_OF_STOCK' in v_src) > 0 then
    raise notice 'place_order_multi porte deja la garde de stock — rien a faire';
    return;
  end if;

  if position(v_anchor_select in v_src) = 0 then
    raise exception 'ancre du SELECT verrouillant introuvable dans place_order_multi — '
                    'le corps deploye a change, relire avant de forcer';
  end if;
  if position(v_anchor_guard in v_src) = 0 then
    raise exception 'ancre PRODUCT_NOT_AVAILABLE introuvable dans place_order_multi — '
                    'le corps deploye a change, relire avant de forcer';
  end if;

  v_new := replace(v_src, v_anchor_select, 'p.price_minor, p.status, p.stock, s.owner_id');
  v_new := replace(v_new, v_anchor_guard, v_block);

  execute v_new;

  -- Ceinture et bretelles : on relit ce qui vient d'etre pose.
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order_multi'
   limit 1;
  if position('OUT_OF_STOCK' in v_src) = 0
     or position('stock = stock - v_qty' in v_src) = 0 then
    raise exception 'la garde de stock n''est pas dans le corps re-pose — abandon';
  end if;
  raise notice 'place_order_multi : garde de stock reposee';
end
$mig$;

-- ===========================================================================
-- 3. LA RESTITUTION, RENDUE SYMETRIQUE ET IDEMPOTENTE
-- ===========================================================================
-- Elle ne rend plus que ce que le marqueur dit avoir ete pris, et elle baisse
-- le marqueur dans le meme mouvement. Appelee deux fois, elle ne rend qu'une
-- fois ; appelee sur une commande d'avant cette migration, elle ne rend rien.
create or replace function public.restore_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  -- L'UPDATE conditionnel EST le verrou : deux appels concurrents ne peuvent
  -- pas tous deux voir stock_taken vrai, la ligne etant verrouillee par le
  -- premier jusqu'a la fin de sa transaction.
  update public.orders
     set stock_taken = false
   where id = p_order_id
     and stock_taken;

  if not found then
    return;
  end if;

  update public.products p
     set stock = p.stock + agg.qty,
         updated_at = now()
    from (
      select oi.product_id, sum(oi.quantity)::int as qty
        from public.order_items oi
       where oi.order_id = p_order_id
       group by oi.product_id
    ) agg
   where p.id = agg.product_id
     -- stock null = quantite non declaree : rien n'avait ete retire, donc rien
     -- a rendre. Sans ce filtre on inventerait de la marchandise.
     and p.stock is not null;
end;
$fn$;

revoke all on function public.restore_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.restore_order_stock(uuid) to service_role;

-- ===========================================================================
-- 4. LE DECLENCHEUR — ELARGI, PARCE QU'IL EST DESORMAIS SUR
-- ===========================================================================
-- Il ne couvrait que 'placed' -> 'cancelled', c'est-a-dire le paiement jamais
-- encaisse. Tout le reste reposait sur des appels explicites a
-- restore_order_stock, et il en manquait : une commande en especes n'est
-- balayee par aucun cron (expire_stale_escrows l'exclut), donc apres la remise
-- du decrement ses unites seraient perdues pour toujours.
--
-- Le marqueur permet d'etre genereux sans risque : le declencheur peut couvrir
-- TOUTE entree dans un etat terminal non honore, l'idempotence empeche la
-- double restitution, et un appel explicite qui suivrait ne fera rien.
--
-- BEFORE et non AFTER : on modifie NEW.stock_taken directement, sans re-mettre
-- a jour la ligne depuis son propre declencheur.
create or replace function public.restore_stock_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if not old.stock_taken then
    return new;
  end if;

  update public.products p
     set stock = p.stock + agg.qty,
         updated_at = now()
    from (
      select oi.product_id, sum(oi.quantity)::int as qty
        from public.order_items oi
       where oi.order_id = new.id
       group by oi.product_id
    ) agg
   where p.id = agg.product_id
     and p.stock is not null;

  new.stock_taken := false;
  return new;
end;
$fn$;

revoke all on function public.restore_stock_on_order_cancel() from public, anon, authenticated;

drop trigger if exists trg_restore_stock_on_order_cancel on public.orders;
create trigger trg_restore_stock_on_order_cancel
  before update of status on public.orders
  for each row
  when (new.status in ('cancelled', 'refunded')
        and old.status is distinct from new.status)
  execute function public.restore_stock_on_order_cancel();

-- ===========================================================================
-- 5. CONTROLE FINAL
-- ===========================================================================
do $check$
declare
  v_src text;
  v_multi_ok boolean;
  v_batch_ok boolean;
begin
  select position('OUT_OF_STOCK' in pg_get_functiondef(p.oid)) > 0 into v_multi_ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order_multi' limit 1;

  select position('OUT_OF_STOCK' in pg_get_functiondef(p.oid)) > 0 into v_batch_ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_orders_batch' limit 1;

  if not coalesce(v_multi_ok, false) or not coalesce(v_batch_ok, false) then
    raise exception 'les DEUX chemins de commande doivent porter la garde de stock '
                    '(multi=% batch=%)', v_multi_ok, v_batch_ok;
  end if;

  -- Le lookup de portefeuille par kind, pose le 2026-09-24, doit avoir survecu
  -- a la chirurgie. C'est le point que le CREATE OR REPLACE aurait casse.
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order_multi' limit 1;
  if position('kind' in v_src) = 0 then
    raise warning 'place_order_multi ne mentionne plus « kind » — verifier la '
                  'separation des caisses Vendeur/Immo avant de servir du trafic';
  end if;

  raise notice 'garde de stock : les deux chemins sont couverts';
end
$check$;
