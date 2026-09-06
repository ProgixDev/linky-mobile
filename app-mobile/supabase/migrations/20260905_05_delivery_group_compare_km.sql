-- Correctif de 20260905_04 : comparer des KILOMETRES, pas des prix plafonnes.
--
-- CE QUI N'ALLAIT PAS. delivery_group_fee_minor comparait
--   least( somme des frais par boutique , delivery_fee_linear(trajet enchaine) ).
-- Or delivery_fee_linear plafonne a delivery_pricing.max_fee_minor (50 000 GNF,
-- soit 25 km). Des que le trajet enchaine depasse 25 km il vaut 50 000, donc il
-- paraissait toujours moins cher qu'une somme de deux courses elles-memes
-- plafonnees (jusqu'a 100 000). Verifie sur les donnees reelles le 2026-09-07 :
-- la colonne « trajet_enchaine » valait 50 000 sur 9 lignes sur 10.
--
-- CONSEQUENCE CONCRETE, et c'est l'inverse de la demande : deux boutiques dans
-- des directions OPPOSEES, a 25 km chacune du client, donnaient
--   somme  = 100 000
--   chaine = A->B (50 km) + B->C (25 km) = 75 km -> plafonnee a 50 000
-- et le min() choisissait la chaine. On aurait facture le tarif « meme chemin »
-- a des trajets opposes — exactement le cas ou le client demande d'ADDITIONNER.
--
-- LA REGLE, CORRIGEE : on compare les distances brutes.
--   somme_km  = A->C + B->C
--   chaine_km = A->B + B->C
--   chaine_km < somme_km  => meme chemin  => UNE course, prix du trajet enchaine
--   sinon                 => chemins opposes => NULL, et l'appelant retombe sur
--                            le calcul par boutique existant (somme des frais,
--                            chacun avec son propre plafond) — c'est-a-dire
--                            exactement le comportement d'avant, inchange.
--
-- Le plafond n'entre donc plus dans la DECISION ; il ne s'applique plus qu'au
-- prix finalement retenu. Et le cas « opposes » retombe litteralement sur le
-- code d'avant, sans nouvelle regle de plafonnement a debattre.

create or replace function public.delivery_group_fee_minor(
  p_shop_ids uuid[], p_address_id uuid
) returns bigint
language sql
stable
set search_path = ''
as $$
  with distinct_shops as (
    select distinct x as shop_id from unnest(p_shop_ids) as x
  ),
  per_shop as (
    select public.delivery_fee_for_shop(d.shop_id, p_address_id) as fee,
           public.delivery_distance_km(d.shop_id, p_address_id)  as km
    from distinct_shops d
  ),
  chain as (
    select public.delivery_chain_km(p_shop_ids, p_address_id) as km
  )
  select case
    when (select count(*) from distinct_shops) < 2 then null
    -- une seule boutique non fiable suffit a invalider le groupe
    when exists (select 1 from per_shop where fee is null or km is null) then null
    when (select km from chain) is null then null
    -- comparaison sur les DISTANCES, jamais sur les prix (le plafond fausserait
    -- le verdict — cf. l'en-tete de cette migration)
    when (select km from chain) < (select sum(km) from per_shop)
      then public.delivery_fee_linear((select km from chain))
    -- chemins opposes : pas de groupage, l'appelant additionne comme avant
    else null
  end;
$$;

revoke all on function public.delivery_group_fee_minor(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.delivery_group_fee_minor(uuid[], uuid) to service_role;
