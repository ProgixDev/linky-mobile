// Frais de livraison forfaitaire Linky (client 2026-07-30 : « la livraison sera
// assurée par Linky avec des frais de livraison applicables »).
//
// Affiché dans le récapitulatif de commande AVANT le paiement. Le serveur est la
// source de vérité sur le montant réellement facturé — cette valeur ne sert qu'à
// montrer un total honnête au client.
//
// ⚠️ À GARDER SYNCHRONISÉ avec le back
// (supabase/functions/_shared/delivery.ts, DELIVERY_FEE_MINOR). GNF est
// zéro-décimale : 15 000 = 15 000 GNF. Forfait V1 ; tarif par zone → V1.1.
export const DELIVERY_FEE_GNF = 15000;

export type DeliveryMode = 'pickup' | 'delivery';
