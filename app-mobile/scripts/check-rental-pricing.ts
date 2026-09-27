// Banc d'essai du moteur de prix des locations.
//
// A LANCER avec : node --experimental-strip-types scripts/check-rental-pricing.ts
// (Node 22 lit le TypeScript nativement ; aucun outil de test n'existe dans ce
// depot et en installer un pour un fichier n'en valait pas le prix.)
//
// Il verifie quatre choses, dans cet ordre d'importance :
//   1. Les deux chiffres REELS du client tombent au franc — 2 semaines a
//      400 000 / nuit, et 1 mois a 8 000 000 au lieu de 13 500 000.
//   2. Le total ne depasse JAMAIS le tarif plein, et ne DECROIT jamais quand la
//      duree augmente. C'est ce qui rend le sur-couvrement acceptable : rester
//      plus longtemps ne peut pas couter moins cher que ce qu'on a annonce.
//   3. Une grille VIDE rend exactement le tarif lineaire d'avant ce lot. C'est
//      la garantie de compatibilite : les annonces deja en ligne ne bougent pas.
//   4. La caution et le sejour minimum se resolvent comme prevu.
//
// Le jumeau serveur est verifie separement par scripts/check-twins.mjs.

import { quoteRental, resolveDeposit, minStayShortfall } from '../src/lib/rentalPricing.ts';

const BASE = 450000;
const RATES = [
  { kind: 'block', units: 7, priceMinor: 2800000 },
  { kind: 'block', units: 30, priceMinor: 8000000 },
];
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

console.log('nuits |       paye |      plein | ~/nuit  | decoupage');
for (const n of [1, 6, 7, 13, 14, 19, 20, 29, 30, 31, 45, 60]) {
  const q = quoteRental('day', BASE, RATES, n);
  const parts = q.parts.map((p) => p.count + 'x' + p.units + 'n@' + fmt(p.priceMinor)).join(' + ');
  console.log(
    String(n).padStart(5), '|', fmt(q.rentMinor).padStart(10), '|',
    fmt(q.fullMinor).padStart(10), '|', String(Math.round(q.rentMinor / n)).padStart(7), '|', parts,
  );
}

let everAbove = false;
let monotone = true;
let prev = 0;
for (let n = 1; n <= 90; n += 1) {
  const q = quoteRental('day', BASE, RATES, n);
  if (q.rentMinor > q.fullMinor) everAbove = true;
  if (q.rentMinor < prev) { monotone = false; console.log('!! total decroit a', n); break; }
  prev = q.rentMinor;
}
console.log('\njamais au-dessus du tarif plein  :', !everAbove);
console.log('total jamais decroissant (1..90) :', monotone);

const c14 = quoteRental('day', BASE, RATES, 14);
const c30 = quoteRental('day', BASE, RATES, 30);
console.log('\nLES DEUX CHIFFRES DU CLIENT');
console.log('  2 semaines a 400 000 / nuit      :', c14.rentMinor / 14 === 400000, '(' + fmt(c14.rentMinor) + ')');
console.log('  1 mois : 8 000 000 vs 13 500 000 :', c30.rentMinor === 8000000 && c30.fullMinor === 13500000);

console.log('\nGRILLE VIDE = le tarif lineaire d avant ce lot, au franc');
for (const n of [1, 7, 30, 90]) {
  const q = quoteRental('day', BASE, [], n);
  console.log('  ', String(n).padStart(2), 'nuits ->', fmt(q.rentMinor).padStart(10),
    q.rentMinor === BASE * n ? 'ok' : 'ECART');
}

console.log('\nPALIERS MENSUELS (base 13,5M ; 3 mois -> 10M ; 6 mois -> 8M)');
const TIERS = [
  { kind: 'tier', units: 3, priceMinor: 10000000 },
  { kind: 'tier', units: 6, priceMinor: 8000000 },
];
for (const m of [1, 2, 3, 5, 6, 12]) {
  const q = quoteRental('month', 13500000, TIERS, m);
  console.log('  ', String(m).padStart(2), 'mois ->', fmt(q.rentMinor).padStart(10), '| remise', fmt(q.discountMinor));
}

console.log('\nCAUTION');
console.log('  2 mois sur un bail obtenu a 8 000 000 :', fmt(resolveDeposit('months', 2, 8000000, 8000000)));
console.log('  10 % d un sejour de 5 000 000         :', fmt(resolveDeposit('percent', 1000, 0, 5000000)));
console.log('  montant fixe 1 500 000                :', fmt(resolveDeposit('amount', 1500000, 0, 0)));
console.log('  aucune caution declaree               :', resolveDeposit(null, null, 8000000, 5000000));

console.log('\nSEJOUR MINIMUM (3 nuits exigees)');
for (const n of [2, 3, 4]) console.log('  ', n, 'nuits ->', minStayShortfall('day', 3, null, n) ?? 'ok');


