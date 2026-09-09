// Un fichier image dont l'extension ment fait echouer le build, tres tard.
//
// LE 2026-09-09, le build vc13 est mort apres 16 min 42 s sur :
//   ERROR: .../drawable-mdpi/assets_images_paykulu.png: AAPT: error: file
//          failed to compile.
// assets/images/pay-kulu.png etait un JPEG portant l'extension .png — le
// fichier tel que le client l'avait envoye. Metro s'en accommode (il resout
// les assets par chemin, jamais par contenu), le rendu etait correct sur
// l'appareil de developpement, et rien n'a signale quoi que ce soit avant
// qu'AAPT n'essaie de « cruncher » le PNG en fin de compilation.
//
// L'ASYMETRIE QUI REND CE PIEGE VICIEUX : AAPT ne recompresse QUE les .png.
// Les 15 mipmap ic_launcher*.webp du dossier android/, generes par le prebuild
// d'Expo, sont eux aussi des PNG mal etiquetes — et ils passent dans tous les
// builds verts depuis toujours, parce qu'un .webp n'est jamais inspecte. On ne
// verifie donc QUE ce que Metro embarque, et on laisse android/res tranquille :
// y toucher casserait quelque chose qui marche pour corriger une faute
// theorique.
//
// Usage : node scripts/check-image-assets.mjs   (sort en 1 si un fichier ment)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['assets'];
const EXPECTED = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp', '.gif': 'gif' };

function sniff(buf) {
  if (buf.length >= 8 && buf.compare(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 0, 8, 0, 8) === 0) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  return 'inconnu';
}

const bad = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const want = EXPECTED[extname(name).toLowerCase()];
    if (!want) continue;
    const got = sniff(readFileSync(p, { length: 16 }).subarray(0, 16));
    if (got !== want) bad.push({ p, want, got });
  }
}
for (const r of ROOTS) walk(r);

if (bad.length) {
  console.error(`\n${bad.length} fichier(s) image dont l'extension ne correspond pas au contenu :\n`);
  for (const b of bad) console.error(`  ${b.p}\n      extension annonce « ${b.want} », le contenu est « ${b.got} »`);
  console.error('\nAAPT refusera de compiler ces fichiers et le build echouera apres ~15 min.');
  console.error('Reencode-les au format que leur extension annonce.\n');
  process.exit(1);
}
console.log(`Assets images : ${ROOTS.join(', ')} — extensions et contenus coherents.`);
