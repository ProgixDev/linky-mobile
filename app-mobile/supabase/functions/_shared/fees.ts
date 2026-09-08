// Le taux de commission Linky — UNE seule source cote serveur TypeScript.
//
// Passe de 3 % a 5 % le 2026-09-08 a la demande du client, en meme temps que
// l'affichage : la commission est desormais INCLUSE dans le prix montre sur
// l'annonce (« Frais inclus ») au lieu de n'apparaitre qu'au paiement.
//
// LE MODELE N'A PAS CHANGE POUR AUTANT :
//   amount_minor  ce que le VENDEUR touche, entier          10 000
//   fees_minor    ce que LINKY prend, EN PLUS                  500
//   total_minor   ce que l'ACHETEUR paie                    10 500
// La commission etait deja portee par l'acheteur ; elle est simplement plus
// elevee et visible plus tot. Aucun vendeur ne touche moins qu'avant.
//
// ⚠️ CE TAUX EXISTE AUSSI EN SQL, et les deux doivent rester d'accord :
//   place_order, place_order_multi, place_orders_batch  -> round(amount * 0.05)
// Un langage ne peut pas importer la constante de l'autre. Si tu changes ce
// nombre, change-les dans la meme foulee (migration 20260908_01) — sinon un
// article et une location factureraient deux taux differents, et l'ecart ne se
// verrait que dans le grand livre, des semaines plus tard.
//
// L'ARRONDI EST CELUI DU SQL, volontairement : round(amount * taux) sur le
// montant TOTAL, jamais unite par unite. Arrondir chaque article separement
// puis sommer donne un resultat different d'un ou deux francs, et c'est
// exactement le genre d'ecart qui fait douter un vendeur de toute l'addition.
export const PLATFORM_FEE_RATE = 0.05;

/** La commission sur un montant vendeur. Meme arrondi que le SQL. */
export function platformFee(amountMinor: number): number {
  return Math.round(amountMinor * PLATFORM_FEE_RATE);
}

/** Ce que l'acheteur paie, commission comprise. */
export function withPlatformFee(amountMinor: number): number {
  return amountMinor + platformFee(amountMinor);
}
