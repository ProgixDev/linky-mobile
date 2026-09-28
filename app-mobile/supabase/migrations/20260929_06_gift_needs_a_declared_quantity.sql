-- ===========================================================================
-- UN DON PORTE TOUJOURS UNE QUANTITÉ DÉCLARÉE (trouvaille #5 de l'audit)
-- 2026-09-28
-- ===========================================================================
--
-- LE DÉFAUT, MESURÉ. `place_gift_order` ne décrémente que si `products.stock`
-- n'est pas nul, et laisse l'annonce `active` dans tous les cas. Un don à stock
-- nul est donc ILLIMITÉ : la sonde a obtenu TROIS réservations sur le même
-- objet — dont une de cent unités — chacune en `paid`, chacune « à retirer chez
-- le donneur ». Le donneur n'a qu'un objet ; deux personnes se déplacent pour
-- rien, et rien dans le système ne le signale.
--
-- COMMENT ON Y ARRIVE. L'audit décrivait un chemin précis, et il existe : une
-- annonce à déclinaisons dont UNE combinaison n'a pas de quantité voit son
-- agrégat passer à `null` (c'est la règle de la remontée : une combinaison non
-- chiffrée rend l'annonce sans plafond). Le vendeur retire ses déclinaisons — la
-- remontée laisse alors `stock` INCHANGÉ, à dessein, pour ne pas mettre son
-- annonce en rupture — puis coche « À donner ». Le `null` a survécu.
--
-- Mais la cause est plus large que ce chemin : TOUT don à quantité non déclarée
-- est illimité, quelle que soit la façon dont il l'est devenu.
--
-- POURQUOI UN INVARIANT DE BASE ET NON UN CAS PARTICULIER. On pourrait traiter
-- `null` comme « un seul » dans `place_gift_order`. Ce serait une exception de
-- plus sur le chemin le plus délicat de l'application — celui qui contourne déjà
-- toute la chaîne monétaire. En exigeant une quantité déclarée, la branche
-- `stock is not null` qui existe DÉJÀ fait tout le travail : elle décrémente,
-- elle lève OUT_OF_STOCK, et elle pose `stock_taken` pour que l'annulation rende
-- l'unité. Rien de neuf à écrire dans le chemin de l'argent.
--
-- ⚠️ AUCUNE REPRISE DE DONNÉES : il y a ZÉRO don en prod (mesuré avant d'écrire
-- ce fichier). Le défaut était latent. La contrainte peut donc être posée sèche.

begin;

-- ---------------------------------------------------------------------------
-- 1. RIEN À REPRENDRE ? ON LE VÉRIFIE PLUTÔT QUE DE L'ESPÉRER
-- ---------------------------------------------------------------------------
-- Si un don à quantité non déclarée était apparu entre la mesure et
-- l'application, la contrainte échouerait avec un message que personne ne
-- saurait interpréter. On l'annonce donc ici, avec le compte et le remède.
do $pre$
declare v_n int;
begin
  select count(*) into v_n from public.products where coalesce(is_gift, false) and stock is null;
  if v_n > 0 then
    raise exception 'REPRISE NECESSAIRE : % don(s) a quantite non declaree. Poser un stock (1 par defaut) avant de rejouer.', v_n;
  end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 2. L'INVARIANT
-- ---------------------------------------------------------------------------
-- `is not true` et non `not is_gift` : une CHECK ne rejette que sur FALSE, donc
-- un `is_gift` nul passerait au travers d'un `not`.
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_gift_has_stock') then
    alter table public.products
      add constraint products_gift_has_stock
      check (is_gift is not true or stock is not null);
  end if;
end
$c$;

comment on constraint products_gift_has_stock on public.products is
  'Un don declare combien d''objets sont donnes. Sans quantite, place_gift_order '
  'ne decremente rien et n''epuise jamais l''annonce : le meme objet se reserve '
  'indefiniment (mesure du 2026-09-28 : 3 reservations dont une de 100 unites). '
  'Avec une quantite, la branche existante decremente, epuise, et pose '
  'stock_taken pour que l''annulation rende l''unite.';

-- ---------------------------------------------------------------------------
-- 3. LA PORTE, NOMMÉE PLUTÔT QUE SUPPOSÉE FERMÉE
-- ---------------------------------------------------------------------------
-- La contrainte rend le cas inatteignable. On le refuse quand même dans la
-- fonction, et par un NOM : une contrainte peut être retirée par une migration
-- future, et ce jour-là un refus explicite vaut mieux qu'un don silencieusement
-- illimité. C'est la logique des six portes GIFT_ORDER.
--
-- CHIRURGIE sur le corps DÉPLOYÉ, jamais un CREATE OR REPLACE depuis le dépôt :
-- les fichiers de migration sont périmés vis-à-vis de la prod. Le texte inséré
-- est volontairement ASCII — seul le texte QUE J'AJOUTE traverse une chaîne
-- construite puis exécutée, et c'est là que le non-ASCII se casse ; les accents
-- déjà présents dans le corps ne quittent jamais la base et survivent (mesuré
-- le 2026-09-28 sur les deux fonctions de commande).
do $fn$
declare
  v_src text;
  v_new text;
  a_stock constant text := 'if v_product.stock is not null then';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_gift_order' limit 1;
  if v_src is null then raise exception 'place_gift_order introuvable'; end if;

  if position('GIFT_STOCK_UNDECLARED' in v_src) > 0 then
    raise notice 'place_gift_order refuse deja un don sans quantite';
  else
    if (length(v_src) - length(replace(v_src, a_stock, ''))) / length(a_stock) <> 1 then
      raise exception 'place_gift_order : ancre STOCK absente ou multiple';
    end if;
    v_new := replace(v_src, a_stock,
      'if v_product.stock is null then raise exception ''GIFT_STOCK_UNDECLARED''; end if;
  ' || a_stock);
    execute v_new;
    raise notice 'place_gift_order : un don sans quantite est desormais refuse par son nom';
  end if;
end
$fn$;

-- Le durcissement du 2026-07-29 : Supabase re-accorde EXECUTE par défaut.
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'place_gift_order'
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
declare v_src text; v_miss text; v_g text;
begin
  if not exists (select 1 from pg_constraint where conname = 'products_gift_has_stock') then
    raise exception 'la contrainte products_gift_has_stock n''existe pas';
  end if;

  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_gift_order' limit 1;

  -- Le correctif, PUIS toutes les gardes qui existaient avant : une chirurgie
  -- qui en emporterait une au passage doit se voir ICI et pas en production.
  v_miss := null;
  foreach v_g in array array[
    'GIFT_STOCK_UNDECLARED',
    'INVALID_QUANTITY', 'PRODUCT_NOT_FOUND', 'NOT_A_GIFT', 'PRODUCT_NOT_AVAILABLE',
    'BUYER_IS_SELLER', 'OUT_OF_STOCK', 'INSUFFICIENT_STOCK',
    'stock = stock - p_quantity', 'v_product.stock is not null'
  ] loop
    if position(v_g in v_src) = 0 then
      v_miss := coalesce(v_miss || ', ', '') || v_g;
    end if;
  end loop;
  -- Les libellés accentués de l'instantané doivent avoir survécu à la chirurgie.
  if position(chr(65533) in v_src) > 0 then
    v_miss := coalesce(v_miss || ', ', '') || 'CARACTERE CASSE';
  end if;
  if v_miss is not null then raise exception 'place_gift_order : %', v_miss; end if;

  raise notice 'un don porte desormais toujours une quantite declaree';
end
$check$;

commit;
