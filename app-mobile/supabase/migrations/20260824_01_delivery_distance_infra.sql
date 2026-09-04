-- ============================================================================
-- Infrastructure de livraison a la distance — PREPARATION, sans changement de
-- facturation aujourd'hui.
--
-- Le client a demande une tarification par distance ; la grille elle-meme
-- (tranches, montants) n'est pas encore fournie. Plutot que d'attendre les bras
-- croises, cette migration construit tout ce qui NE depend PAS de la grille :
--
--   1. Le calcul de distance lui-meme (haversine) — pur, sans effet de bord.
--   2. Une table de tarifs par tranche, ACTUELLEMENT seedee avec UNE seule
--      tranche qui reproduit exactement le prix d'aujourd'hui (5000 GNF/
--      boutique, quelle que soit la distance). Le comportement facture ne
--      change donc PAS avec cette migration.
--
-- Quand la vraie grille arrive, il suffira de REMPLACER les lignes de
-- delivery_tariffs — aucun code, aucun redeploiement. Le branchement de ce
-- calcul dans place_order_multi / place_orders_batch (qui facturent aujourd'hui
-- un forfait fixe passe depuis le JS) reste a faire a ce moment-la,
-- deliberement : le shape exact de la grille (par km, par zone, par commune)
-- decidera de la forme de la requete de branchement, et il vaut mieux le faire
-- une fois pour de vrai que de deviner deux fois.
--
-- POURQUOI LA DISTANCE EST TOUJOURS CALCULABLE : shops.lat/lng et
-- addresses.lat/lng sont NON NULLS en pratique — un declencheur (shops_set_geo,
-- addresses_set_geo, migration 20260625) les remplit automatiquement a
-- l'ecriture, avec un repli par ville/quartier (geo_centroid) puis par defaut
-- sur le centre de Conakry. Aucune adresse ne peut donc se retrouver sans
-- coordonnees.
--
-- ⚠️ JAMAIS APPLIQUEE EN PROD — en-tete corrige le 2026-09-03.
-- Cette ligne annonçait « Applique en prod » ; c'etait faux. Verifie par
-- requete sur mkaddhcjneilvwqethjo : ni haversine_km, ni delivery_distance_km,
-- ni delivery_fee_for_km n'existent. La migration 20260903_01 a d'abord echoue
-- dessus (42883) avant qu'on s'en aperçoive.
--
-- 20260903_01 recree elle-meme haversine_km et delivery_distance_km (les deux
-- seules dont elle a besoin) : elle n'attend plus rien de ce fichier. Ce qui
-- reste ici et n'a jamais tourne : delivery_tariffs + delivery_fee_for_km, le
-- modele PAR TRANCHES — remplace par la regle LINEAIRE du client (2000 GNF/km,
-- delivery_pricing + delivery_fee_linear). A appliquer seulement si un jour on
-- revient a une grille par tranches.
-- ============================================================================

-- ─── 1. Distance a vol d'oiseau, en kilometres ──────────────────────────────
-- Formule haversine standard. immutable + set search_path = '' : pure, aucune
-- lecture de table, safe a appeler en boucle sur un lot de commandes.
create or replace function public.haversine_km(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) returns double precision
language sql
immutable
set search_path = ''
as $$
  select 6371.0 * 2 * asin(
    sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    )
  );
$$;

-- ─── 2. Distance entre une boutique et une adresse ──────────────────────────
-- Une seule porte d'entree : personne n'a besoin de connaitre le detail des
-- deux tables pour obtenir une distance. Retourne NULL seulement si l'un des
-- deux identifiants n'existe pas (jamais a cause de coordonnees manquantes,
-- garanties par les triggers geo).
create or replace function public.delivery_distance_km(
  p_shop_id uuid, p_address_id uuid
) returns double precision
language sql
stable
set search_path = ''
as $$
  select public.haversine_km(s.lat, s.lng, a.lat, a.lng)
  from public.shops s, public.addresses a
  where s.id = p_shop_id and a.id = p_address_id;
$$;

-- ─── 3. Tarifs par tranche de distance ──────────────────────────────────────
-- min_km inclus, max_km exclu ; max_km NULL = pas de plafond (derniere
-- tranche). Une seule ligne aujourd'hui, qui REPRODUIT le forfait actuel : le
-- prix facture ne bouge pas tant que cette table n'a que cette ligne.
create table if not exists public.delivery_tariffs (
  id         uuid primary key default public.uuidv7(),
  min_km     numeric not null default 0,
  max_km     numeric,                    -- null = illimite
  fee_minor  bigint not null check (fee_minor >= 0),
  created_at timestamptz not null default now(),
  check (max_km is null or max_km > min_km)
);
alter table public.delivery_tariffs enable row level security;
-- Pas de politique publique : la tarification n'a rien a faire cote client,
-- seul service_role la lit (via delivery_fee_for_km, security definer).

insert into public.delivery_tariffs (min_km, max_km, fee_minor)
select 0, null, 5000
where not exists (select 1 from public.delivery_tariffs);

-- ─── 4. Tarif pour une distance donnee ──────────────────────────────────────
-- Repli sur la DERNIERE tranche (la plus large) si la distance depasse tout ce
-- qui est defini : mieux vaut facturer le tarif le plus eleve connu que de
-- bloquer une livraison legitime un jour ou la grille aurait un trou.
create or replace function public.delivery_fee_for_km(p_km double precision)
returns bigint
language sql
stable
set search_path = ''
as $$
  select fee_minor from public.delivery_tariffs
  where p_km >= min_km and (max_km is null or p_km < max_km)
  order by min_km desc
  limit 1;
$$;

revoke all on function public.haversine_km(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.delivery_distance_km(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delivery_fee_for_km(double precision) from public, anon, authenticated;
grant execute on function public.haversine_km(double precision, double precision, double precision, double precision) to service_role;
grant execute on function public.delivery_distance_km(uuid, uuid) to service_role;
grant execute on function public.delivery_fee_for_km(double precision) to service_role;
