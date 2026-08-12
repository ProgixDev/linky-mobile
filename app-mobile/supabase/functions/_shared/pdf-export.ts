// Génère le PDF « Mes données personnelles » (client 2026-08-11 : l'export
// partait en JSON brut, illisible pour un utilisateur).
//
// Pourquoi cote SERVEUR et pas sur le telephone : rendre du HTML en PDF sur
// l'appareil demanderait expo-print, un module NATIF. L'app est en workflow
// bare, donc l'ajouter imposerait un nouveau build — et le client teste
// aujourd'hui par mises a jour a distance, qui ne peuvent pas embarquer de
// natif. pdf-lib est du JavaScript pur et tourne dans Deno sans rien installer.
//
// pdf-lib ne sait NI couper les lignes NI paginer : tout ce qui suit — retour a
// la ligne, saut de page, pied de page — est fait a la main.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';

// Couleurs de la marque, identiques a src/theme (primaryDeep / accent).
const VERT = rgb(0x0a / 255, 0x52 / 255, 0x40 / 255);
const OR = rgb(0xe8 / 255, 0xa5 / 255, 0x3d / 255);
const TEXTE = rgb(0.13, 0.14, 0.13);
const GRIS = rgb(0.42, 0.44, 0.43);
const TRAIT = rgb(0.88, 0.89, 0.88);
const BLANC = rgb(1, 1, 1);

const A4: [number, number] = [595.28, 841.89];
const MARGE = 48;
const LARGEUR = A4[0] - MARGE * 2;

/** Les polices standard PDF encodent en WinAnsi : un caractere hors de cette
 *  table (arabe, cyrillique, emoji…) fait LEVER une exception a pdf-lib et
 *  ferait echouer tout l'export. Les noms d'utilisateurs etant libres, on
 *  neutralise en amont plutot que de risquer un plantage. */
function safe(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const s = String(v);
  if (s === '') return '—';
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

/** Date ISO -> « 11/08/2026 ». Une date brute au format machine dans un
 *  document destine a un humain est exactement le defaut qu'on corrige ici. */
function dateFr(v: unknown): string {
  if (!v) return '—';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return safe(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Les montants sont stockes en unites mineures (bigint) — jamais affiches tels
 *  quels a l'utilisateur. */
function montant(minor: unknown, devise = 'GNF'): string {
  const n = Number(minor);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fr-FR').replace(/ | /g, ' ')} ${devise}`;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  pages: PDFPage[];
}

function nouvellePage(c: Ctx): void {
  c.page = c.doc.addPage(A4);
  c.pages.push(c.page);
  c.y = A4[1] - MARGE;
}

/** Reserve `h` points ; ouvre une page si le bas est atteint. */
function place(c: Ctx, h: number): void {
  if (c.y - h < MARGE + 28) nouvellePage(c);
}

/** Coupe un texte a la largeur disponible, en mesurant la police reelle. */
function lignes(texte: string, font: PDFFont, taille: number, largeur: number): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
  if (!mots.length) return ['—'];
  const out: string[] = [];
  let ligne = '';
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (font.widthOfTextAtSize(essai, taille) <= largeur) {
      ligne = essai;
    } else {
      if (ligne) out.push(ligne);
      // Un mot seul plus large que la colonne (URL, jeton) : on le coupe.
      if (font.widthOfTextAtSize(mot, taille) > largeur) {
        let bout = '';
        for (const ch of mot) {
          if (font.widthOfTextAtSize(bout + ch, taille) > largeur) {
            out.push(bout);
            bout = ch;
          } else bout += ch;
        }
        ligne = bout;
      } else ligne = mot;
    }
  }
  if (ligne) out.push(ligne);
  return out;
}

function titreSection(c: Ctx, texte: string): void {
  place(c, 46);
  c.y -= 26;
  c.page.drawRectangle({ x: MARGE, y: c.y - 4, width: 3, height: 16, color: OR });
  c.page.drawText(safe(texte).toUpperCase(), {
    x: MARGE + 11, y: c.y, size: 11, font: c.bold, color: VERT,
  });
  c.y -= 8;
  c.page.drawLine({
    start: { x: MARGE, y: c.y }, end: { x: MARGE + LARGEUR, y: c.y },
    thickness: 0.7, color: TRAIT,
  });
  c.y -= 6;
}

/** Ligne « libelle : valeur ». Le libelle occupe une colonne fixe pour que tout
 *  s'aligne verticalement d'un bloc a l'autre. */
function champ(c: Ctx, libelle: string, valeur: string): void {
  const COL = 150;
  const corps = lignes(safe(valeur), c.regular, 10, LARGEUR - COL);
  place(c, 14 * corps.length + 4);
  c.y -= 15;
  c.page.drawText(safe(libelle), { x: MARGE, y: c.y, size: 9.5, font: c.bold, color: GRIS });
  corps.forEach((l, i) => {
    c.page.drawText(l, { x: MARGE + COL, y: c.y - i * 13, size: 10, font: c.regular, color: TEXTE });
  });
  c.y -= (corps.length - 1) * 13;
}

function vide(c: Ctx, texte: string): void {
  place(c, 20);
  c.y -= 16;
  c.page.drawText(safe(texte), { x: MARGE, y: c.y, size: 9.5, font: c.regular, color: GRIS });
}

/** Tableau a colonnes proportionnelles. `poids` somme a 1. */
function tableau(c: Ctx, entetes: string[], poids: number[], donnees: string[][]): void {
  const cols = poids.map((p) => LARGEUR * p);
  const x = (i: number) => MARGE + cols.slice(0, i).reduce((a, b) => a + b, 0);

  const enTete = () => {
    place(c, 24);
    c.y -= 16;
    entetes.forEach((h, i) => {
      c.page.drawText(safe(h).toUpperCase(), {
        x: x(i), y: c.y, size: 8, font: c.bold, color: GRIS,
      });
    });
    c.y -= 5;
    c.page.drawLine({
      start: { x: MARGE, y: c.y }, end: { x: MARGE + LARGEUR, y: c.y },
      thickness: 0.5, color: TRAIT,
    });
  };
  enTete();

  for (const rangee of donnees) {
    const cellules = rangee.map((v, i) => lignes(safe(v), c.regular, 9.5, cols[i] - 8));
    const hauteur = Math.max(...cellules.map((l) => l.length)) * 12 + 6;
    // Une rangee coupee en deux par un saut de page devient illisible : on la
    // deplace entiere, et on redessine l'en-tete sur la nouvelle page.
    if (c.y - hauteur < MARGE + 28) {
      nouvellePage(c);
      enTete();
    }
    c.y -= 14;
    cellules.forEach((l, i) => {
      l.forEach((ligne, j) => {
        c.page.drawText(ligne, {
          x: x(i), y: c.y - j * 12, size: 9.5, font: c.regular, color: TEXTE,
        });
      });
    });
    c.y -= (Math.max(...cellules.map((l) => l.length)) - 1) * 12 + 4;
  }
}

type Bundle = Record<string, unknown>;
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

export async function buildDataExportPdf(bundle: Bundle): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Linky - Mes donnees personnelles');
  doc.setCreator('Linky');

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c: Ctx = { doc, page: null as unknown as PDFPage, y: 0, regular, bold, pages: [] };
  nouvellePage(c);

  // ── Bandeau de couverture ────────────────────────────────────────────────
  c.page.drawRectangle({ x: 0, y: A4[1] - 132, width: A4[0], height: 132, color: VERT });
  c.page.drawText('Linky', { x: MARGE, y: A4[1] - 56, size: 26, font: bold, color: BLANC });
  c.page.drawRectangle({ x: MARGE, y: A4[1] - 68, width: 34, height: 3, color: OR });
  c.page.drawText('Mes donnees personnelles', {
    x: MARGE, y: A4[1] - 96, size: 15, font: bold, color: BLANC,
  });
  c.page.drawText(`Export du ${dateFr(bundle.exported_at)}`, {
    x: MARGE, y: A4[1] - 116, size: 10, font: regular, color: rgb(0.82, 0.9, 0.86),
  });
  c.y = A4[1] - 132 - 10;

  const p = (bundle.profile ?? {}) as Record<string, unknown>;

  titreSection(c, 'Profil');
  champ(c, 'Nom affiche', safe(p.display_name));
  champ(c, 'Ville', safe(p.city));
  champ(c, 'Roles', Array.isArray(p.roles) ? (p.roles as string[]).join(', ') : '—');
  champ(c, 'Verification identite', p.kyc_status === 'approved' ? 'Verifiee' : 'Non verifiee');
  champ(c, 'Profil public', p.profile_public ? 'Oui' : 'Non');
  champ(c, 'Membre depuis', dateFr(p.created_at));
  champ(c, 'Identifiant', safe(p.id));

  titreSection(c, 'Contacts');
  const emails = arr(bundle.emails);
  const phones = arr(bundle.phones);
  if (!emails.length && !phones.length) vide(c, 'Aucun contact enregistre.');
  if (emails.length) {
    tableau(c, ['Adresse e-mail', 'Principale', 'Verifiee le'], [0.55, 0.18, 0.27],
      emails.map((e) => [safe(e.address), e.is_primary ? 'Oui' : 'Non', dateFr(e.verified_at)]));
  }
  if (phones.length) {
    tableau(c, ['Numero', 'Operateur', 'Principal', 'Verifie le'], [0.3, 0.24, 0.16, 0.3],
      phones.map((t) => [safe(t.e164), safe(t.carrier), t.is_primary ? 'Oui' : 'Non', dateFr(t.verified_at)]));
  }

  titreSection(c, 'Adresses de livraison');
  const addresses = arr(bundle.addresses);
  if (!addresses.length) vide(c, 'Aucune adresse enregistree.');
  else tableau(c, ['Libelle', 'Ville', 'Quartier', 'Par defaut'], [0.3, 0.24, 0.28, 0.18],
    addresses.map((a) => [safe(a.label), safe(a.city), safe(a.district), a.is_default ? 'Oui' : 'Non']));

  titreSection(c, 'Boutiques et agences');
  const shops = arr(bundle.shops);
  if (!shops.length) vide(c, 'Aucune boutique ni agence.');
  else tableau(c, ['Nom', 'Ville', 'Creee le'], [0.46, 0.28, 0.26],
    shops.map((s) => [safe(s.name), safe(s.city), dateFr(s.created_at)]));

  titreSection(c, 'Articles publies');
  const products = arr(bundle.products);
  if (!products.length) vide(c, 'Aucun article publie.');
  else tableau(c, ['Titre', 'Prix', 'Statut', 'Publie le'], [0.4, 0.22, 0.16, 0.22],
    products.map((x) => [safe(x.title), montant(x.price_minor), safe(x.status), dateFr(x.created_at)]));

  titreSection(c, 'Biens immobiliers');
  const properties = arr(bundle.properties);
  if (!properties.length) vide(c, 'Aucun bien publie.');
  else tableau(c, ['Titre', 'Type', 'Prix', 'Statut', 'Publie le'], [0.32, 0.14, 0.2, 0.14, 0.2],
    properties.map((x) => [safe(x.title), safe(x.type), montant(x.price_minor), safe(x.status), dateFr(x.created_at)]));

  titreSection(c, 'Commandes passees');
  const orders = arr(bundle.orders_as_buyer);
  if (!orders.length) vide(c, 'Aucune commande.');
  else tableau(c, ['Reference', 'Statut', 'Total', 'Date'], [0.3, 0.22, 0.26, 0.22],
    orders.map((o) => [safe(o.reference), safe(o.status), montant(o.total_minor, safe(o.currency)), dateFr(o.created_at)]));

  titreSection(c, 'Avis deposes');
  const reviews = arr(bundle.reviews_written);
  if (!reviews.length) vide(c, 'Aucun avis depose.');
  else tableau(c, ['Note', 'Commentaire', 'Date'], [0.12, 0.66, 0.22],
    reviews.map((r) => [`${safe(r.rating)}/5`, safe(r.comment), dateFr(r.created_at)]));

  titreSection(c, 'Commentaires ecrits');
  const comments = arr(bundle.comments_written);
  if (!comments.length) vide(c, 'Aucun commentaire.');
  else tableau(c, ['Sur', 'Commentaire', 'Date'], [0.16, 0.62, 0.22],
    comments.map((m) => [safe(m.listing_kind), safe(m.body), dateFr(m.created_at)]));

  // ── Mention finale ───────────────────────────────────────────────────────
  place(c, 60);
  c.y -= 28;
  c.page.drawLine({
    start: { x: MARGE, y: c.y + 10 }, end: { x: MARGE + LARGEUR, y: c.y + 10 },
    thickness: 0.7, color: TRAIT,
  });
  for (const l of lignes(
    "Ce document rassemble les donnees que Linky detient sur votre compte. Il ne contient "
    + "que ce qui vous concerne. Pour toute demande de rectification ou de suppression, "
    + "utilisez « Supprimer mon compte » dans les reglages de confidentialite, ou ecrivez-nous.",
    regular, 8.5, LARGEUR)) {
    c.page.drawText(l, { x: MARGE, y: c.y, size: 8.5, font: regular, color: GRIS });
    c.y -= 11;
  }

  // ── Pieds de page (apres coup : le nombre total n'est connu qu'a la fin) ──
  c.pages.forEach((pg, i) => {
    const t = `Linky  -  Mes donnees personnelles  -  Page ${i + 1} / ${c.pages.length}`;
    pg.drawText(t, {
      x: MARGE, y: MARGE - 16, size: 8, font: regular, color: GRIS,
    });
  });

  return await doc.save();
}
