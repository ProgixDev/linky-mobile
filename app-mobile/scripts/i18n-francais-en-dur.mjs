// Refuse la reapparition du francais ecrit en dur dans l'interface.
//
// Le defaut qu'il garde : quand l'appli est en anglais, les cles se traduisent
// bien, mais a cote d'elles des libelles ecrits en dur dans le code restent en
// francais. Les captures prises pour le Play Store le montraient — une fiche
// article entierement anglaise avec « Occasion », « 3 favoris » et
// « Ajouter au panier » au milieu.
//
// Il lit l'ARBRE SYNTAXIQUE, pas des expressions regulieres. Une premiere
// version regexp annoncait zero fuite alors qu'il en restait : elle ne voyait
// pas `{product.favCount} favoris` (un noeud de texte JSX voisin d'une
// accolade), ni les ternaires dans les attributs. Elle frappait a la bonne
// porte du mauvais mur.
//
// Il compte ce qui finit sur l'ecran :
//   - un noeud de texte JSX                       >Itineraire<
//   - une chaine passee a un attribut JSX         label="..."  label={cond ? '...' : '...'}
//   - une chaine passee a un toast / une alerte   show('...')  Alert.alert('...')
//   - une chaine affectee a une propriete d'affichage  { label: '...' }
// Un identifiant n'est PAS un libelle : `code: 'Électronique'` est la valeur
// stockee en base (les categories sont traduites par `labelKey`), et la cle
// passee a t('...') n'est pas du texte.
//
//   node scripts/i18n-francais-en-dur.mjs
//
// Sortie 1 = une chaine francaise s'est reglissee dans l'interface.
// Sortie 2 = la sonde elle-meme ne mesure plus rien (voir CONTROLE).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIERS = ['app', 'src'];

// Ce qui reste en francais DELIBEREMENT, et pourquoi.
const TOLERE = [
  // Un nom de langue s'ecrit dans sa propre langue : c'est la convention de
  // tous les selecteurs (on n'ecrit pas « French » dans une liste de langues).
  { fichier: 'app/settings/index.tsx', valeur: 'Français' },
  // Meme raison : le repli du nom de langue sur la ligne « Langue » du profil.
  { fichier: 'app/(tabs)/profil.tsx', valeur: 'Français' },
  // Le contrat de bail PDF est une piece juridique guineenne : il reste en
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

// Proprietes d'objet dont la valeur s'affiche (hors JSX).
const PROPS_AFFICHEES = new Set([
  'label', 'title', 'subtitle', 'placeholder', 'blurb', 'message', 'body',
  'helperText', 'hint', 'cta', 'ctaLabel', 'confirmLabel', 'cancelLabel',
  'emptyTitle', 'emptyBody', 'description', 'error', 'text',
]);

const ACCENTS = /[àâäçèéêëîïôöùûüœÀÂÉÈÊÎÏÔÙÛÇ]/;
// « En attente » n'a aucun accent et c'est pourtant du francais pur.
const MOTS_FR = new RegExp('\\b(?:le|la|les|un|une|des|du|de|au|aux|en|dans|sur|sous|chez|vers|par|pour|avec|sans|contre|entre|jusqu|ce|cet|cette|ces|celui|celle|ceux|celles|mon|ma|mes|ton|ta|tes|sa|ses|notre|nos|votre|vos|leur|leurs|je|tu|il|elle|nous|vous|ils|elles|qui|que|quoi|dont|ou|et|mais|donc|ni|est|sont|etait|etaient|sera|seront|ete|etre|avoir|ont|avait|sois|soit|ne|pas|rien|aucun|aucune|tout|toute|tous|toutes|si|quand|comme|alors|ainsi|encore|deja|toujours|jamais|chaque|autre|autres|meme|memes|moins|tres|trop|peut|peux|pouvez|doit|dois|devez|faut|veut|veux|espace|tableau|bord|compte|ecran|annonce|annonces|boutique|commande|livraison|paiement|portefeuille|reservation|vendeur|acheteur|livreur|avis|vue|vues|attente|envoye|recu|nouveau|nouvelle|retrait|colis|achat|acheter|bail|vente|vendu|historique|montant|gratuit|commentaires|envoyer|retour|partager|retirer|enregistrer|fermer|localisation|contacter|autoriser|autorisez|suivi|disponible|aimer|annuler|neuf|recharger|immobilier|continuer|logement|panier|sejour|loyer|bien|biens)\\b', 'i');

// Un jeton unique tout en minuscules n'est pas un libelle : c'est un
// identifiant (`value="neuf"`, `name="wallet/recharger"`). Un texte
// affiche porte une majuscule ou plusieurs mots.
const identifiant = (v) => !/\s/.test(v.trim()) && v.trim() === v.trim().toLowerCase();
const francais = (v) => v.trim().length >= 3 && !identifiant(v) && (ACCENTS.test(v) || MOTS_FR.test(v));

function fichiers(dir, acc = []) {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) {
      if (nom === 'node_modules' || nom === 'i18n') continue;
      fichiers(p, acc);
    } else if (/\.tsx?$/.test(nom) && !/\.d\.ts$/.test(nom)) {
      acc.push(p);
    }
  }
  return acc;
}

// La chaine est-elle l'argument d'un t('...') ? Alors c'est une CLE.
function estUneCle(n) {
  const p = n.parent;
  if (!p || !ts.isCallExpression(p) || p.arguments[0] !== n) return false;
  const e = p.expression;
  return (ts.isIdentifier(e) && e.text === 't')
    || (ts.isPropertyAccessExpression(e) && e.name.text === 't');
}

// La chaine finit-elle sur l'ecran ?
function sAffiche(n) {
  let cour = n;
  let p = cour.parent;
  // on remonte a travers ternaires, parentheses et {} d'attribut JSX
  while (p && (ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p)
    || ts.isJsxExpression(p) || ts.isBinaryExpression(p))) {
    cour = p;
    p = p.parent;
  }
  if (!p) return false;
  if (ts.isJsxAttribute(p)) return true;
  if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
    return PROPS_AFFICHEES.has(p.name.text);
  }
  if (ts.isCallExpression(p)) {
    const e = p.expression;
    const nom = ts.isPropertyAccessExpression(e) ? e.name.text
      : (ts.isIdentifier(e) ? e.text : '');
    return nom === 'show' || nom === 'alert';
  }
  return false;
}

function scanne() {
  const trouve = [];
  for (const dossier of DOSSIERS) {
    for (const chemin of fichiers(join(RACINE, dossier))) {
      const rel = relative(RACINE, chemin).split(sep).join('/');
      if (rel.includes('/i18n/')) continue;
      const src = readFileSync(chemin, 'utf8');
      const sf = ts.createSourceFile(chemin, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const note = (n, v) => {
        if (!francais(v)) return;
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        trouve.push({ fichier: rel, ligne: line + 1, valeur: v.trim().replace(/\s+/g, ' ') });
      };
      const visite = (n) => {
        if (ts.isJsxText(n)) {
          note(n, n.text);
        } else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
          if (!estUneCle(n) && sAffiche(n)) note(n, n.text);
        } else if (ts.isTemplateExpression(n)) {
          // `Linky vous livre — ${x}` : les morceaux litteraux comptent
          if (sAffiche(n)) {
            const bouts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)];
            for (const b of bouts) note(n, b);
          }
        }
        ts.forEachChild(n, visite);
      };
      visite(sf);
    }
  }
  return trouve;
}

const tout = scanne();

// ── CONTROLE : une sonde qui ne sait pas echouer ne prouve rien ───────────
// Elle DOIT voir « Français » (garde deliberement) et NE DOIT PAS prendre
// l'identifiant « Électronique » pour un libelle.
const valeurs = new Set(tout.map((x) => x.valeur));
if (!valeurs.has('Français')) {
  console.error("CONTROLE : la sonde ne voit plus « Français » (app/settings/index.tsx),");
  console.error('un libelle qu on garde DELIBEREMENT en francais. Elle ne mesure donc');
  console.error('plus rien — repare la sonde avant de croire son total.');
  process.exit(2);
}
if (valeurs.has('Électronique')) {
  console.error("CONTROLE : la sonde prend l identifiant `code: 'Électronique'` pour un libelle.");
  process.exit(2);
}

const fuites = tout.filter(
  (x) => !TOLERE.some((t) => t.fichier === x.fichier && (t.valeur === null || t.valeur === x.valeur)),
);

if (fuites.length === 0) {
  console.log(`Aucun francais en dur dans l'interface (${tout.length} tolerees, controle passe).`);
  process.exit(0);
}

const parFichier = new Map();
for (const f of fuites) {
  if (!parFichier.has(f.fichier)) parFichier.set(f.fichier, []);
  parFichier.get(f.fichier).push(f);
}
console.error(`${fuites.length} chaine(s) francaise(s) ecrite(s) en dur :\n`);
for (const [fic, items] of [...parFichier].sort((a, b) => b[1].length - a[1].length)) {
  console.error(`${fic}  (${items.length})`);
  for (const i of items) console.error(`    ${String(i.ligne).padEnd(6)}${i.valeur.slice(0, 76)}`);
  console.error('');
}
console.error("Remplace-les par t('...') et ajoute la cle dans les trois locales.");
process.exit(1);
