// Frais de livraison forfaitaire Linky (client 2026-07-30 : « la livraison sera
// assurée par Linky avec des frais de livraison applicables »).
//
// Affiché dans le récapitulatif de commande AVANT le paiement. Le serveur est la
// source de vérité sur le montant réellement facturé — cette valeur ne sert qu'à
// montrer un total honnête au client.
//
// ⚠️ À GARDER SYNCHRONISÉ avec le back
// (supabase/functions/_shared/delivery.ts, DELIVERY_FEE_MINOR). GNF est
// zéro-décimale : 5 000 = 5 000 GNF. Forfait V1 ; tarif par zone → V1.1.
//
// 2026-08-22 : 15 000 -> 5 000 GNF, et le forfait s'applique desormais PAR
// BOUTIQUE (deux boutiques = deux colis = deux trajets = 2 x 5 000), presente a
// l'acheteur comme un seul chiffre. Une tarification a la DISTANCE est prevue :
// Abdoulaye doit fournir la grille de calcul.
export const DELIVERY_FEE_GNF = 5000;

export type DeliveryMode = 'pickup' | 'delivery';
