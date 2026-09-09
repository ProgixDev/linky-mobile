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
  // « Carte bancaire » : les deux marques d'acceptation, dessinees a la main
  // (cercles Mastercard aux couleurs officielles + le mot VISA). 1,6 Ko — un
  // logo telecharge aurait pese vingt fois plus pour une tuile de 40 px.
  card: require('../../assets/images/pay-card.png') as number,
  // LA CARTE LINKY, dessinee. Le client a d'abord vu une version qui reprenait
  // seulement le mark ∞ et a repondu, a juste titre : « ca ne ressemble pas a
  // une carte ». D'ou une silhouette de carte, avec le ∞ en OR dessus.
  //
  // POURQUOI IL N'Y A PAS DE PUCE. Trois elements ne tiennent pas dans 40 px :
  // teste a la taille reelle, la puce devenait un point dore sans forme et le
  // ∞ s'ecrasait. La silhouette suffit a dire « carte » ; la puce ne disait
  // plus rien. Deux elements, tous deux lisibles.
  walletLinky: require('../../assets/images/pay-wallet-linky.png') as number,
  // Portefeuille guineen. Fichier fourni par le client le 2026-09-09.
  kulu: require('../../assets/images/pay-kulu.png') as number,
} as const;
