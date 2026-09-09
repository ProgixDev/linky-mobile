// Les logos des moyens de paiement, en UN seul endroit.
//
// POURQUOI CE FICHIER. Les lignes de paiement existent en DEUX exemplaires :
// `OperatorRow` dans app/checkout/index.tsx (le paiement marketplace) et
// `PaymentMethodPicker` (la reservation immobiliere et le boost). Les deux
// chargeaient leur propre `require('../../assets/images/pay-orange-money.png')`.
// Deux copies, donc deux occasions d'oublier l'une quand on ajoute un rail —
// et c'est exactement ce qui etait arrive : Orange et MTN avaient leur logo,
// Kulu, Soutra Money et PayCard tombaient sur une icone de carte generique dans
// les deux ecrans.
//
// Demande du client, 2026-09-09 : « Si tu peux rajouter les logos stp pour le
// visuel ».
//
// FORMAT ATTENDU. Chaque fichier est un PNG CARRE (les deux existants font
// 447x447 et 512x512). La tuile fait 40x40, coins arrondis, sur fond BLANC, et
// l'image est affichee en `cover` — donc un logo qui porte deja sa marge dans
// une image carree tombe juste. Un fond transparent marche aussi : il laisse
// voir le blanc de la tuile.
export const PAY_LOGOS = {
  orangeMoney: require('../../assets/images/pay-orange-money.png') as number,
  mtnMomo: require('../../assets/images/pay-mtn-momo.png') as number,
} as const;
