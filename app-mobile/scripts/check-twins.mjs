// Refuse que deux jumeaux divergent.
//
// POURQUOI. Deno ne peut pas importer hors de supabase/functions, et Metro ne
// peut pas importer depuis @shared : certains modules existent donc en double,
// un exemplaire de chaque cote. Jusqu'ici la discipline tenait a un commentaire
// d'en-tete — c'est ainsi que le taux de commission a failli vivre a deux
// valeurs, et c'est exactement le chemin par lequel une garde de stock a
// disparu entre deux migrations sans que personne ne le voie.
//
// rentalPricing decide du prix d'un CONTRAT SIGNE : si le telephone et le
// serveur ne calculent pas la meme chose au franc, le locataire signe un
// montant et en paie un autre. Ce fichier rend la divergence impossible a
// commettre en silence.
//
// USAGE : node scripts/check-twins.mjs
// A lancer avant tout deploiement qui touche l'un des couples ci-dessous.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const COUPLES = [
  // Le seul couple STRICTEMENT identique pour l'instant. Les autres jumeaux du
  // depot (fees.ts, dates.ts, delivery.ts) ont diverge en commentaires et en
  // exports avant que ce script n'existe ; les aligner est un chantier a part,
  // et les declarer ici sans les avoir alignes ne ferait que rendre le script
  // rouge en permanence, donc inutile. On les ajoutera un par un, apres
  // alignement.
  ['src/lib/rentalPricing.ts', 'supabase/functions/_shared/rental-pricing.ts'],
];

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

let failed = 0;
for (const [a, b] of COUPLES) {
  let ha;
  let hb;
  try {
    ha = sha(a);
    hb = sha(b);
  } catch (e) {
    console.error(`✗ ${a} <-> ${b}\n  illisible : ${e.message}`);
    failed += 1;
    continue;
  }
  if (ha === hb) {
    console.log(`✓ ${a} <-> ${b}`);
  } else {
    console.error(
      `✗ ${a} <-> ${b}\n` +
        `  Les deux exemplaires different. Reporte la modification dans l'AUTRE,\n` +
        `  puis relance. Ne « corrige » pas en copiant a l'aveugle : relis d'abord\n` +
        `  ce qui a change, l'un des deux peut porter un correctif que l'autre\n` +
        `  n'a pas.`,
    );
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} couple(s) divergent(s).`);
  process.exit(1);
}
console.log(`\n${COUPLES.length} couple(s) verifie(s).`);
