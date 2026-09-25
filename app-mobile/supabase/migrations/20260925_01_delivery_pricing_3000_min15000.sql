-- NOUVELLE GRILLE DE LIVRAISON : 3 000 GNF/km, MINIMUM 15 000 GNF.
--
-- Demande du client, 2026-09-25 : « Pour le calcul des frais de livraison, on
-- va mettre 1km = 3000 GNF au lieu de 2000. Aussi, si la distance est
-- inferieure a 5km mettre minimum 15 000 GNF. Donc de 0 a 4,9km c'est
-- 15 000 GNF, A partir de 5km c'est 3000 GNF / km ».
--
-- RIEN A RECODER : la tarification vit dans une table depuis le 2026-09-03
-- (delivery_pricing, une seule ligne), et delivery_fee_linear la lit :
--     greatest(min_fee, least(max_fee, ceil(km) * rate_per_km))
-- Les deux nombres demandes suffisent donc, et la regle tombe juste toute
-- seule : ceil(4,9) = 5, soit 5 x 3 000 = 15 000 — exactement le minimum. Le
-- passage des courses courtes aux courses longues est continu, sans marche
-- d'escalier a 5 km.
--
-- ┌─ DEUX CHIFFRES QUE SA REGLE IMPLIQUE SANS LES NOMMER ─────────────────────┐
--
-- LE PLAFOND. Il valait 50 000, ce qui aplatissait le tarif des ~17 km et
-- contredisait donc « a partir de 5 km c'est 3000 GNF / km » au-dela. Il passe
-- a 150 000 (50 km) pour ne plus servir qu'a ce pour quoi il existe : empecher
-- qu'un point GPS aberrant facture une geometrie fictive. Conakry fait ~36 km
-- dans sa plus grande longueur, donc aucune course reelle n'est concernee.
--
-- LE REPLI, lui, ne vit pas ici : c'est DELIVERY_FEE_MINOR
-- (supabase/functions/_shared/delivery.ts), applique quand la distance n'est
-- PAS mesurable — l'un des deux points etant encore le centroide de sa ville,
-- faute de pin sur la carte. Il valait 5 000 : une course non mesurable aurait
-- donc coute trois fois moins que la plus courte des courses mesurables. Il
-- passe a 15 000, le plancher de la grille. Meme commit.
update public.delivery_pricing
   set rate_per_km_minor = 3000,
       min_fee_minor     = 15000,
       max_fee_minor     = 150000,
       updated_at        = now();

-- La table n'a qu'une ligne (id booleen). Si elle etait vide, la grille
-- n'existerait pas et delivery_fee_linear rendrait NULL — le devis basculerait
-- silencieusement sur le repli pour tout le monde.
do $mig$
declare v_n int;
begin
  select count(*) into v_n from public.delivery_pricing;
  if v_n <> 1 then
    raise exception 'delivery_pricing : % ligne(s), attendu exactement 1', v_n;
  end if;
end
$mig$;
