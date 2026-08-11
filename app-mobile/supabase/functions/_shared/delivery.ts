// Frais de livraison forfaitaire Linky (client 2026-07-30 : « la livraison sera
// assurée par Linky avec des frais de livraison applicables »).
//
// GNF est zéro-décimale : minor == major, donc 15 000 minor = 15 000 GNF.
// Le serveur est autoritaire : l'edge fn passe cette valeur à place_order pour
// une commande 'delivery' ; un retrait ('pickup') est toujours à 0.
//
// ⚠️ À GARDER SYNCHRONISÉ avec le front (app-mobile/src/lib/delivery.ts,
// DELIVERY_FEE_GNF) — le récap client affiche ce même montant avant le paiement.
// Forfait V1 ; une tarification par distance/zone est une évolution V1.1.
export const DELIVERY_FEE_MINOR = 15000;
