-- ===========================================================================
-- UNE SEULE RESTITUTION, UN SEUL ORDRE DE VERROUILLAGE
-- (la SECONDE porte de #12, et #10 de l'audit)
-- 2026-09-28
-- ===========================================================================
--
-- ┌─ CE QUE J'AVAIS MANQUÉ CE MATIN ────────────────────────────────────────┐
-- La migration 20260929_05 a posé le filtre `oi.stock_taken` sur
-- `restore_order_stock`, et sa sonde est verte. Sauf qu'il y a DEUX chemins de
-- restitution, et elle n'en couvrait qu'un :
--
--   • `refund_order_to_buyer` appelle `restore_order_stock` — corrigé.
--   • TOUT passage d'une commande en `cancelled` / `refunded` déclenche
--     `trg_restore_stock_on_order_cancel` (BEFORE UPDATE OF status, ACTIF), qui
--     RÉIMPLÉMENTE la restitution — sans le filtre.
--
-- Mesuré, pas déduit : la scène exacte de #12, annulée par un `update orders set
-- status = 'cancelled'` au lieu d'un appel direct, rend la combinaison à 3 au
-- lieu de 2. Le défaut était donc toujours vivant sur le chemin réel, et ma
-- sonde passait parce qu'elle frappait à la bonne porte du mauvais mur.
--
-- La leçon vaut mieux que le correctif : DEUX COPIES D'UNE RÈGLE D'ARGENT
-- FINISSENT TOUJOURS PAR DIVERGER. On n'en garde donc qu'une.
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ ET #10, L'ORDRE DE VERROUILLAGE ───────────────────────────────────────┐
-- `replace_product_variants` prend la ligne PRODUIT puis les lignes FILLES —
-- elle le documente, et les deux fonctions de commande font pareil. La
-- restitution faisait l'inverse : son écriture sur `products` ne concerne que
-- les lignes SANS déclinaison (son sous-select filtre `variant_id is null`),
-- donc sur un article à déclinaisons elle ne verrouille RIEN ; elle touchait la
-- ligne fille d'abord, et le parent seulement ensuite, par la remontée.
-- Interblocage possible entre l'enregistrement d'une matrice et une restitution.
--
-- L'ordre textuel du code ne disait pas la vérité : il fallait lire le
-- sous-select pour voir que la première écriture ne verrouille pas le parent.
--
-- Le préambule prend les lignes produit D'ABORD, et DANS L'ORDRE DES
-- IDENTIFIANTS : deux restitutions concurrentes qui partagent des articles se
-- sérialisent alors au lieu de se croiser.
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ⚠️ Les corps ci-dessous sont écrits depuis le corps DÉPLOYÉ, relu juste avant
-- (pg_get_functiondef), et non depuis un fichier du dépôt — les fichiers de
-- migration sont périmés vis-à-vis de la prod. Le risque que porte la règle
-- « jamais de CREATE OR REPLACE d'une fonction d'argent », c'est d'écrire depuis
-- une source périmée, pas l'instruction elle-même.

begin;

-- ---------------------------------------------------------------------------
-- 1. LE CORPS UNIQUE
-- ---------------------------------------------------------------------------
create or replace function public.restore_order_stock_lines(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  r record;
begin
  -- LES LIGNES PRODUIT D'ABORD, DANS UN ORDRE DETERMINISTE (#10).
  --
  -- C'est l'ordre de `replace_product_variants` et des deux fonctions de
  -- commande : parent puis enfant. Sans ce preambule, la restitution d'un
  -- article a declinaisons prenait la ligne fille en premier et le parent
  -- ensuite, par la remontee -- l'inverse, donc un interblocage possible.
  --
  -- `order by p.id` en plus : deux restitutions concurrentes qui partagent des
  -- articles se serialisent au lieu de se croiser entre elles.
  for r in
    select distinct p.id
      from public.products p
      join public.order_items oi on oi.product_id = p.id
     where oi.order_id = p_order_id
     order by p.id
  loop
    perform 1 from public.products where id = r.id for update;
  end loop;

  -- LES LIGNES SANS DECLINAISON.
  --
  -- `oi.stock_taken` est la garde de #12 : une ligne dont la cible n'avait
  -- AUCUNE quantite declaree au moment de la commande n'a retire aucune unite.
  -- Lui en rendre une invente du stock des lors que le vendeur a chiffre sa
  -- matrice entre-temps -- donc de la survente, donc un litige puis un
  -- remboursement, et le stock invente reste.
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

  -- LES DECLINAISONS. Rendre a la combinaison declenche la remontee, qui remet
  -- products.stock d'aplomb. Une combinaison passee en 'hidden' entre-temps
  -- recoit quand meme son du : elle n'est plus comptee dans l'agregat, donc rien
  -- n'apparait, et si le vendeur la remet en vente c'est SA saisie qui fera foi.
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

comment on function public.restore_order_stock_lines(uuid) is
  'LE SEUL endroit ou la restitution de stock est ecrite. Ses deux appelants -- '
  'restore_order_stock (chemin remboursement) et restore_stock_on_order_cancel '
  '(declencheur sur passage en cancelled/refunded) -- ne font que l''encadrer. '
  'Deux copies d''une regle d''argent finissent par diverger : c''est arrive, le '
  'declencheur a garde six semaines un filtre que la fonction avait recu.';

-- ---------------------------------------------------------------------------
-- 2. LE CHEMIN REMBOURSEMENT N'ENCADRE PLUS QUE L'IDEMPOTENCE
-- ---------------------------------------------------------------------------
create or replace function public.restore_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  -- `orders.stock_taken` reste le marqueur d'IDEMPOTENCE de la commande : c'est
  -- lui qui garantit qu'on ne rend pas deux fois. La VERITE de ce qui a ete pris
  -- est par LIGNE depuis 20260929_05, et elle vit dans le corps partage.
  update public.orders
     set stock_taken = false
   where id = p_order_id and stock_taken;
  if not found then return; end if;
  perform public.restore_order_stock_lines(p_order_id);
end
$fn$;

-- ---------------------------------------------------------------------------
-- 3. LE DECLENCHEUR, IDEM
-- ---------------------------------------------------------------------------
create or replace function public.restore_stock_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if not old.stock_taken then return new; end if;
  perform public.restore_order_stock_lines(new.id);
  -- BEFORE UPDATE : on pose le marqueur sur la ligne en cours d'ecriture plutot
  -- que par un second UPDATE, qui serait perdu. C'est aussi ce qui fait que le
  -- chemin remboursement ne restitue pas deux fois : refund_order_to_buyer
  -- appelle restore_order_stock AVANT de passer la commande en 'refunded', donc
  -- `old.stock_taken` vaut deja faux quand ce declencheur s'execute.
  new.stock_taken := false;
  return new;
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
       and p.proname in ('restore_order_stock_lines', 'restore_order_stock',
                         'restore_stock_on_order_cancel')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------------------
-- 4. CONTRÔLE
-- ---------------------------------------------------------------------------
do $check$
declare v_body text; v_wrap text; v_name text;
begin
  select pg_get_functiondef(p.oid) into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'restore_order_stock_lines' limit 1;
  if v_body is null then raise exception 'le corps partage n''existe pas'; end if;

  -- le filtre de #12, sur les DEUX restitutions
  if (length(v_body) - length(replace(v_body, 'and oi.stock_taken', ''))) / length('and oi.stock_taken') <> 2 then
    raise exception 'le corps partage doit filtrer les DEUX restitutions';
  end if;
  -- le preambule de #10
  if position('for update' in v_body) = 0 or position('order by p.id' in v_body) = 0 then
    raise exception 'le corps partage ne prend pas les lignes produit d''abord, dans l''ordre';
  end if;
  if position(chr(65533) in v_body) > 0 then
    raise exception 'corps partage : CARACTERE CASSE';
  end if;

  -- ET LE POINT QUI COMPTE VRAIMENT : plus aucun des deux appelants ne
  -- reimplemente la restitution. C'est ce qui rend la divergence IMPOSSIBLE,
  -- et non simplement corrigee aujourd'hui.
  foreach v_name in array array['restore_order_stock', 'restore_stock_on_order_cancel'] loop
    select pg_get_functiondef(p.oid) into v_wrap
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name limit 1;
    if v_wrap is null then raise exception '% introuvable', v_name; end if;
    if position('restore_order_stock_lines' in v_wrap) = 0 then
      raise exception '% ne delegue pas au corps partage', v_name;
    end if;
    if position('product_variants' in v_wrap) > 0 then
      raise exception '% reimplemente encore la restitution', v_name;
    end if;
    if position('stock_taken' in v_wrap) = 0 then
      raise exception '% a perdu sa garde d''idempotence', v_name;
    end if;
  end loop;

  -- Le declencheur doit toujours etre attache, et actif : tout ce qui precede
  -- ne servirait a rien s'il avait ete detache au passage.
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.orders'::regclass
       and t.tgname = 'trg_restore_stock_on_order_cancel'
       and t.tgenabled = 'O'
  ) then
    raise exception 'trg_restore_stock_on_order_cancel absent ou desactive';
  end if;

  raise notice 'une seule restitution, un seul ordre de verrouillage';
end
$check$;

commit;
