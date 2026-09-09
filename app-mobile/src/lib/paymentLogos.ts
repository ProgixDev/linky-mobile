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
  // LA CARTE LINKY, fournie par le client (2026-09-09) : carte verte, puce
  // doree, symbole infini pose dessus.
  //
  // J'AVAIS PREDIT QU'ELLE NE TIENDRAIT PAS A 40 px, et j'avais tort. Mon
  // objection portait sur un ∞ « vert sur vert » — mais je n'avais compare que
  // les TEINTES. A la taille reelle, le vert du symbole est nettement plus
  // CLAIR que celui du corps de carte, et cet ecart de valeur suffit : le ∞
  // reste lisible, la puce aussi. Verifie en rendant le fichier a 40 px avant
  // de le retenir, comme les six autres.
  //
  // Elle dit aussi mieux « carte bancaire » que la version que j'avais
  // dessinee, ce qui etait precisement la demande du client.
  //
  // Recadree sur la carte (la source faisait 1254 px avec une large marge
  // blanche) et reduite a 256 px en palette : 767 Ko -> 20 Ko.
  walletLinky: require('../../assets/images/pay-wallet-linky.png') as number,
  // Portefeuille guineen. Fichier fourni par le client le 2026-09-09.
  kulu: require('../../assets/images/pay-kulu.png') as number,
  // Soutra Money : recadre sur l'ELEPHANT seul. Le logo complet porte le
  // nom, le mot « money » et un slogan ; a 40 px le slogan devenait de la
  // bouillie et tirait tout le reste vers le bas. Le slogan chevauchant la
  // trompe horizontalement, aucun rectangle ne pouvait les separer : il a
  // fallu blanchir tout ce qui n'etait pas bleu. Meme parti que Kulu, dont le
  // client a lui-meme envoye la baleine seule — et la ligne porte de toute
  // facon le nom ecrit a cote.
  soutraMoney: require('../../assets/images/pay-soutra-money.png') as number,
  paycard: require('../../assets/images/pay-paycard.png') as number,
} as const;
