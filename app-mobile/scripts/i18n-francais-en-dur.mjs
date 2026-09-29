// Refuse la reapparition du francais ecrit en dur dans l'interface.
//
// Le defaut qu'il garde : en anglais (ou en espagnol), l'appli servait un
// melange — les cles traduites en anglais, et a cote des libelles restes en
// francais dans le code. Les captures du Play Store le montraient.
//
// Il ne compte QUE ce qui finit sur l'ecran :
//   - une propriete d'affichage  label / title / placeholder / hint / ...
//   - un noeud de texte JSX      >Itineraire<
//   - un argument de toast       show('...') / Alert.alert('...')
// Un identifiant n'est pas un libelle : `code: 'Électronique'` est la valeur
// stockee en base, les categories sont traduites par `labelKey`. La sonde le
// verifie explicitement (voir CONTROLE, plus bas) parce qu'une premiere
// version les comptait et annoncait 234 fuites la ou il y en avait 39.
//
//   node scripts/i18n-francais-en-dur.mjs
//
// Sortie 1 = une chaine francaise s'est reglissee dans l'interface.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RACINE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DOSSIERS = ['app', 'src'];

// Ce qui reste en francais DELIBEREMENT, et pourquoi.
const TOLERE = [
  // Un nom de langue s'ecrit dans sa propre langue : c'est la convention de
  // tous les selecteurs (on n'ecrit pas « French » dans une liste de langues).
  { fichier: 'app/settings/index.tsx', valeur: 'Français' },
  // Le contrat de bail est une piece juridique guineenne : il reste en
  // francais quelle que soit la langue de l'appli.
  { fichier: 'src/lib/contractPdf.ts', valeur: null },
  // Ces `title` ne s'affichent pas : la barre est rendue par
  // src/components/nav/BottomTabBar.tsx, qui traduit deja via t('tabs.*').
  { fichier: 'app/(tabs)/_layout.tsx', valeur: null },
  // Noms et descriptions des CANAUX de notification Android : ils vivent dans
  // les reglages du telephone, pas dans l'appli, et ne sont ecrits qu'a la
  // creation du canal (identifiants versionnes).
  { fichier: 'src/lib/notifyKinds.ts', valeur: null },
];

const PROPS = '(?:label|title|subtitle|placeholder|blurb|message|body|helperText|'
  + 'hint|cta|ctaLabel|confirmLabel|cancelLabel|emptyTitle|emptyBody|description|error|text)';
const AFFICHE = new RegExp(PROPS + `\\s*[:=]\\s*[{(]?\\s*(['"])([^'"\\n]{3,}?)\\1`, 'g');
const NOEUD = /> *([^<>{}\n][^<>{}\n]{3,}?) *</g;
const TOAST = /(?:show|Alert\.alert|toast)\s*\(\s*(['"])([^'"\n]{3,}?)\1/g;

const ACCENTS = /[àâäçèéêëîïôöùûüœÀÂÉÈÊÎÏÔÙÛÇ]/;
// « En attente » n'a aucun accent et c'est pourtant du francais pur : le
// controle negatif l'a montre, d'ou cette seconde passe par mots-outils.
const MOTS_FR = new RegExp(
  '\\b(?:le|la|les|un|une|des|du|de|au|aux|en|ton|ta|tes|votre|vos|pour|avec|'
  + 'sans|dans|sur|est|sont|tout|tous|quand|apres|avant|cette|ce|ses|son|et|ou|'
  + 'plus|moins|deja|chez|vers|par|attente|envoye|recu|nouveau|nouvelle)\\b', 'i');

const francais = (v) => ACCENTS.test(v) || MOTS_FR.test(v);

function fichiers(dir, acc = []) {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) {
      if (nom === 'node_modules' || nom === 'i18n') continue;
      fichiers(p, acc);
    } else if (/\.tsx?$/.test(nom)) {
      acc.push(p);
    }
  }
  return acc;
}

function scanne() {
  const trouve = [];
  for (const dossier of DOSSIERS) {
    for (const p of fichiers(join(RACINE, dossier))) {
      const rel = relative(RACINE, p).split(sep).join('/');
      if (rel.includes('/i18n/')) continue;
      let bloc = false;
      readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        const s = l.trim();
        if (s.startsWith('/*')) bloc = true;
        if (bloc) { if (s.includes('*/')) bloc = false; return; }
        if (s.startsWith('//') || s.startsWith('*')) return;
        const avant = l.includes('//') ? l.split('//')[0] : l;
        const vus = [];
        for (const m of avant.matchAll(AFFICHE)) vus.push([m[2], m.index + m[0].indexOf(m[2])]);
        for (const m of avant.matchAll(TOAST)) vus.push([m[2], m.index + m[0].indexOf(m[2])]);
        for (const m of avant.matchAll(NOEUD)) vus.push([m[1], m.index + m[0].indexOf(m[1])]);
        for (const [v, pos] of vus) {
          if (!francais(v)) continue;
          // t('cle') : la chaine EST la cle, pas du texte.
          if (avant.slice(Math.max(0, pos - 5), pos).replace(/['"(\s]+$/, '').endsWith('t')) continue;
          trouve.push({ fichier: rel, ligne: i + 1, valeur: v });
        }
      });
    }
  }
  return trouve;
}

const tout = scanne();

// ── CONTROLE : une sonde qui ne sait pas echouer ne prouve rien ───────────
// Elle DOIT voir « Français » (garde deliberement) et NE DOIT PAS voir
// « Électronique » (identifiant serveur, deja traduit par labelKey).
const valeurs = new Set(tout.map((x) => x.valeur));
if (!valeurs.has('Français')) {
  console.error("CONTROLE : la sonde ne voit plus « Français » (app/settings/index.tsx).");
  console.error('Elle ne mesure donc plus rien — repare la sonde avant de croire son total.');
  process.exit(2);
}
if (valeurs.has('Électronique')) {
  console.error("CONTROLE : la sonde compte l'identifiant `code: 'Électronique'` comme un libelle.");
  process.exit(2);
}

const fuites = tout.filter(
  (x) => !TOLERE.some((t) => t.fichier === x.fichier && (t.valeur === null || t.valeur === x.valeur)),
);

if (fuites.length === 0) {
  console.log(`Aucun francais en dur dans l'interface (${tout.length} tolerees, controle passe).`);
  process.exit(0);
}

console.error(`${fuites.length} chaine(s) francaise(s) ecrite(s) en dur :\n`);
for (const f of fuites) console.error(`  ${f.fichier}:${f.ligne}  ${f.valeur}`);
console.error("\nRemplace-les par t('...') et ajoute la cle dans les trois locales.");
process.exit(1);
