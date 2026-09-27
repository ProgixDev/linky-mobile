-- ===========================================================================
-- TROIS DÉFAUTS DU LOT « DÉCLINAISONS », TROUVÉS PAR L'AUDIT ADVERSARIAL
-- 2026-09-27 · corrige 20260928_01 / 20260928_02
-- ===========================================================================
--
-- Les trois vivent dans replace_product_variants et dans l'ordre des
-- combinaisons. Aucun ne touche au chemin de l'argent : pas de chirurgie sur
-- place_order_multi ni sur place_orders_batch ici.
--
-- ---------------------------------------------------------------------------
-- #13 — LA GARDE « COMMANDES EN VOL » INTERDISAIT À VIE
-- ---------------------------------------------------------------------------
-- `orders.stock_taken` n'est remis à faux que par la restitution, et son
-- déclencheur ne s'arme que sur 'cancelled' / 'refunded'. Une commande
-- HONORÉE ('released') garde donc le marqueur pour toujours — vérifié en base :
-- la colonne vaut `true` par défaut et rien ne l'efface à la clôture normale.
--
-- Or la garde testait `o.stock_taken` SANS regarder le statut. Conséquence : la
-- vendeuse qui a vendu et livré une paire le lundi ne peut plus JAMAIS décliner
-- cette annonce en tailles — et le message lui promet le contraire (« une fois
-- qu'elles seront terminées » : elles le sont). La fonctionnalité phare de la
-- livraison devenait indisponible précisément sur les annonces qui vendent.
--
-- La bonne question n'est pas « cette commande a-t-elle pris des unités ? »
-- mais « peut-elle encore les RENDRE ? ». Une commande 'released' ne le peut
-- plus : ses unités sont vendues, pas réservées.
--
-- ---------------------------------------------------------------------------
-- #11 — LE SENS INVERSE N'ÉTAIT PAS GARDÉ DU TOUT
-- ---------------------------------------------------------------------------
-- La garde ne couvrait que simple -> déclinaisons (`if not v_had and
-- v_count > 0`). Le retour, déclinaisons -> simple, passait sans contrôle :
-- une combinaison déjà commandée passe `hidden`, puis la restitution (litige,
-- remboursement automatique, annulation) lui rend son unité — sur une ligne que
-- plus aucun écran ne peut atteindre, puisque le formulaire ne propose plus de
-- matrice et que draftFromProduct ne ressuscite pas les lignes masquées. Le
-- stock vendable était amputé en silence.
--
-- La règle devient donc symétrique et se dit en une phrase : on ne CHANGE PAS
-- DE MODE tant qu'une commande peut encore rendre des unités.
--
-- ---------------------------------------------------------------------------
-- #8 — L'ORDRE DE SAISIE DES TAILLES N'ÉTAIT PAS CONSERVÉ
-- ---------------------------------------------------------------------------
-- Le correctif du matin (trier par `created_at` puis `id`) ne fait pas ce qu'il
-- promet, et l'audit a eu raison contre moi : toutes les lignes d'un même
-- `insert ... select` partagent l'horodatage de la TRANSACTION, donc le premier
-- critère ne discrimine rien ; et `uuidv7()` est ici « millisecondes +
-- 10 octets aléatoires », sans compteur, donc le second trie au hasard.
--
-- Le vendeur voyait ses propres tailles mélangées dans son formulaire, et
-- l'acheteur des pastilles dans le désordre — « L, XL, S, M » là où le code
-- promettait S, M, L, XL. Seule une colonne de position peut tenir cette
-- promesse ; on l'écrit depuis `with ordinality`, c'est-à-dire depuis l'ordre
-- exact du tableau envoyé par le téléphone.

begin;

-- ---------------------------------------------------------------------------
-- 1. LA POSITION
-- ---------------------------------------------------------------------------
alter table public.product_variants
  add column if not exists position integer not null default 0;

comment on column public.product_variants.position is
  'Rang de la combinaison dans la saisie du vendeur (0 = première). created_at '
  'ne peut pas servir : toutes les lignes d''un même enregistrement partagent '
  'l''horodatage de la transaction, et uuidv7() n''est pas monotone ici.';

-- Rattrapage des lignes existantes : on ne peut pas retrouver l'ordre de
-- saisie perdu, mais un ordre STABLE et lisible vaut mieux qu'un ordre
-- aléatoire. À défaut de mieux, l'ordre alphabétique naturel.
with ranked as (
  select id,
         (row_number() over (partition by product_id order by size, color) - 1) as rn
    from public.product_variants
)
update public.product_variants v
   set position = ranked.rn
  from ranked
 where ranked.id = v.id;

create index if not exists product_variants_order_idx
  on public.product_variants (product_id, position)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 2. LA FONCTION D'ÉCRITURE, TROISIÈME VERSION
-- ---------------------------------------------------------------------------
-- Recréée en entier et non par chirurgie : cette fonction est née le
-- 2026-09-28 et n'a jamais subi de surgery, le corps déployé est donc
-- exactement celui du dépôt (vérifié par pg_get_functiondef avant d'écrire).
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
  v_live  boolean;
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

  -- UNE COMMANDE QUI PEUT ENCORE RENDRE SES UNITES.
  --
  -- Le statut compte autant que le marqueur : stock_taken n'est jamais remis a
  -- faux sur une commande honoree, donc le tester seul revient a bloquer pour
  -- toujours des qu'une vente a eu lieu. 'released' ne retient plus rien : les
  -- unites sont vendues. 'disputed' si, tant que l'arbitrage peut rembourser.
  v_live := exists (
    select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
     where oi.product_id = p_product_id
       and o.stock_taken
       and o.status in ('paid', 'preparing', 'delivered', 'disputed')
  );

  -- ON NE CHANGE PAS DE MODE TANT QU'UNE COMMANDE PEUT RENDRE DES UNITES.
  --
  -- Simple -> declinaisons : products.stock deviendrait un agregat recalcule
  -- depuis les lignes filles, et la reservation d'un acheteur qui a deja paye
  -- s'evaporerait -- avec de l'argent en sequestre.
  --
  -- Declinaisons -> simple : l'unite rendue plus tard atterrirait sur une
  -- combinaison masquee que plus aucun ecran ni aucune saisie ne peut
  -- atteindre, et le stock vendable serait ampute en silence. C'est le miroir
  -- exact du premier cas, et il n'etait pas garde.
  --
  -- MODIFIER une matrice qui reste une matrice est toujours permis : les lignes
  -- filles gardent leur identite, rien ne s'evapore.
  if v_live and ((not v_had and v_count > 0) or (v_had and v_count = 0)) then
    raise exception 'LIVE_ORDERS';
  end if;

  -- 1. Poser ou mettre a jour ce que le vendeur envoie, DANS SON ORDRE.
  --    `with ordinality` rend le rang du tableau JSON, c'est-a-dire l'ordre
  --    exact dans lequel il a saisi ses tailles et ses couleurs.
  insert into public.product_variants (product_id, size, color, stock, status, position)
  select p_product_id,
         coalesce(x.value ->> 'size', ''),
         coalesce(x.value ->> 'color', ''),
         nullif(x.value ->> 'stock', '')::int,
         'active',
         (x.ord - 1)::int
    from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb))
         with ordinality as x(value, ord)
  on conflict (product_id, size, color) do update
     set stock    = excluded.stock,
         status   = 'active',
         position = excluded.position;

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

-- ---------------------------------------------------------------------------
-- 3. CONTRÔLE
-- ---------------------------------------------------------------------------
do $check$
declare
  v_src text;
  g     text;
  v_miss text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='product_variants' and column_name='position'
  ) then
    raise exception 'product_variants.position absente';
  end if;

  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'replace_product_variants' limit 1;

  v_miss := null;
  foreach g in array array[
    -- les gardes qui existaient et ne doivent pas avoir disparu
    'PRODUCT_NOT_FOUND', 'TOO_MANY_VARIANTS', 'GIFT_HAS_NO_VARIANTS', 'LIVE_ORDERS',
    'for update',
    -- les correctifs de ce fichier
    'with ordinality', 'position = excluded.position',
    'o.status in (', 'v_had and v_count = 0'
  ] loop
    if position(g in v_src) = 0 then
      v_miss := coalesce(v_miss || ', ', '') || g;
    end if;
  end loop;

  -- L'ancienne garde borgne ne doit plus exister : elle bloquait a vie. On vise
  -- son texte EXACT (produit et marqueur sur la meme ligne, sans statut), et non
  -- « o.stock_taken » seul -- que la nouvelle garde contient aussi, legitimement.
  if position('oi.product_id = p_product_id and o.stock_taken' in v_src) > 0 then
    v_miss := coalesce(v_miss || ', ', '') || 'ANCIENNE GARDE SANS STATUT';
  end if;
  if position(chr(65533) in v_src) > 0 then
    v_miss := coalesce(v_miss || ', ', '') || 'CARACTERE CASSE';
  end if;

  if v_miss is not null then
    raise exception 'replace_product_variants : %', v_miss;
  end if;

  raise notice 'garde symetrique et consciente du statut, position ecrite depuis l''ordre de saisie';
end
$check$;

commit;
