// La commission Linky, côté affichage.
//
// DEMANDE DU CLIENT, 2026-09-08 : « On va finalement mettre 5% et intégrer
// directement au prix des annonces. Si le vendeur met 10 000 GNF, l'appli
// rajoute les +5% et affiche 10 500 GNF. Le client lui voit 10 500 GNF.
// Pareil pour la partie immo. Avec le message "Frais inclus". »
//
// PRÉCISION DU MÊME SOIR (23:05) : « Concernant le message "Frais inclus" il
// doit apparaître uniquement à la finalisation du paiement. » L'étiquette a
// donc été retirée des cartes, des fiches, du fil Découvrir et du panier ; elle
// ne subsiste que sur le récapitulatif de paiement et sur le reçu de commande.
//
// ⚠️ CE QUE ÇA IMPLIQUE POUR LA SUITE. L'étiquette servait aussi de garde-fou
// visible : tant qu'elle accompagnait un prix, une surface qui aurait oublié
// `priceWithFeeGnf` se voyait. Ce n'est plus le cas — un prix affiché sans la
// commission passerait désormais inaperçu jusqu'à l'écran de paiement, où
// l'acheteur découvrirait un montant plus élevé que celui de l'annonce. Toute
// NOUVELLE surface qui montre un prix à un acheteur doit passer par
// `priceWithFeeGnf`, sans exception.
//
// CE QUI EST STOCKÉ RESTE LE PRIX DU VENDEUR. `products.price_minor` et
// `properties.price_minor` valent toujours 10 000 : c'est ce que le vendeur a
// saisi et ce qu'il touchera, entier. Le +5 % est un habillage d'AFFICHAGE,
// calculé au dernier moment. Le stocker gonflé aurait été le début des ennuis —
// à la première modification du taux, toutes les annonces existantes auraient
// porté l'ancien, et personne n'aurait su lesquelles.
//
// ⚠️ CE TAUX EXISTE À TROIS ENDROITS et les trois doivent rester d'accord :
//   ici                                        (affichage)
//   supabase/functions/_shared/fees.ts         (réservations)
//   place_order / place_order_multi /
//   place_orders_batch                         (SQL, migration 20260908_01)
// Aucun ne peut importer l'autre. Si tu changes ce nombre, change les trois
// dans la même foulée — sinon l'annonce afficherait un prix et le paiement en
// réclamerait un autre, ce qui est la pire façon de perdre la confiance d'un
// acheteur.
//
// L'ARRONDI COPIE CELUI DU SQL, volontairement : `round(montant × taux)` sur le
// montant TOTAL de la commande, jamais article par article. Pour un panier de
// 3 × 333 GNF, arrondir par unité donne 350 × 3 = 1 050, alors que le serveur
// calcule round(999 × 0,05) = 50, soit 1 049. Un franc d'écart entre le panier
// et l'écran de paiement, et l'acheteur ne croit plus l'addition.
// D'où la règle : additionner les prix vendeur D'ABORD, appliquer la
// commission ENSUITE — voir `priceWithFeeGnf` appliqué à une somme.
export const PLATFORM_FEE_RATE = 0.05;

/** La commission sur un montant vendeur. Même arrondi que le SQL. */
export function platformFeeGnf(baseGnf: number): number {
  return Math.round(baseGnf * PLATFORM_FEE_RATE);
}

/**
 * Le prix tel que l'ACHETEUR doit le voir, commission comprise.
 *
 * À appliquer sur un prix unitaire pour une vignette, ou sur une SOMME de prix
 * vendeur pour un total de panier — jamais unité par unité puis additionné.
 */
export function priceWithFeeGnf(baseGnf: number): number {
  return baseGnf + platformFeeGnf(baseGnf);
}

/**
 * Le prix VENDEUR maximal dont le prix ACHETEUR reste sous `displayedMaxGnf`.
 *
 * Les filtres du Marché portent sur le plafond que l'acheteur LIT (« moins de
 * 100 000 »), mais le serveur compare `price_minor`, le prix du vendeur. Sans
 * cette conversion, un article à 98 000 passe le filtre et s'affiche 102 900 —
 * au-dessus de ce que l'acheteur venait de demander, ce qui donne l'impression
 * que le filtre ne marche pas.
 *
 * Vérifié : 100 000 → 95 238, et priceWithFeeGnf(95 238) = 100 000 (inclus),
 * priceWithFeeGnf(95 239) = 100 001 (exclu).
 */
export function sellerPriceCeilingGnf(displayedMaxGnf: number): number {
  return Math.floor(displayedMaxGnf / (1 + PLATFORM_FEE_RATE));
}
