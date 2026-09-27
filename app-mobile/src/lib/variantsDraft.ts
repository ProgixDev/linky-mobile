import type { Product, ProductVariant } from '../data/types';

// LE BROUILLON DE LA MATRICE, et la raison de sa forme.
//
// Le client a écrit sa demande ainsi : « Taille 41 (Noire, rouge, bleue) /
// Taille 44 (Noire, rouge, bleue) ». Il pense en DEUX LISTES, et l'application
// fabrique le croisement. Lui faire saisir dix-huit lignes à la main serait
// fidèle au modèle de données et infidèle à sa façon de compter — sur un
// téléphone, ce serait aussi l'assurance qu'il abandonne.
//
// Il saisit donc ses tailles, ses couleurs, et remplit une quantité par
// combinaison. Le croisement se fait ici, dans un seul endroit.

export interface VariantsDraft {
  enabled: boolean;
  sizes: string[];
  colors: string[];
  /** Quantité par combinaison, indexée par `taille\u0000couleur`. */
  stock: Record<string, number | null>;
}

/**
 * Le plafond de combinaisons. DOIT rester égal à MAX_VARIANTS de
 * `supabase/functions/_shared/variants.ts` : au-delà, le serveur refuse dans sa
 * validation de forme, donc AVANT le handler — le vendeur reçoit alors le
 * « Corps invalide » générique de wrap.ts, qui ne dit ni la règle ni le nombre,
 * après avoir rempli toutes ses cases. Le message soigné écrit dans les deux
 * fonctions edge (« Vingt combinaisons au maximum. ») est inatteignable par
 * construction : c'est donc ICI que la limite doit se dire.
 */
export const MAX_VARIANTS = 20;

/** La longueur maximale d'une valeur d'axe, même raison, même fichier. */
export const MAX_AXIS_LEN = 40;

export const EMPTY_VARIANTS: VariantsDraft = {
  enabled: false,
  sizes: [],
  colors: [],
  stock: {},
};

/** La clé d'une combinaison. Un séparateur qu'aucune saisie ne contient. */
export const comboKey = (size: string, color: string) => size + '\u0000' + color;

/**
 * Les combinaisons, dans l'ordre de lecture : taille par taille, couleurs à
 * l'intérieur. C'est l'ordre dans lequel le client les a écrites.
 *
 * Un axe vide ne bloque pas : un vendeur peut n'avoir que des couleurs (un
 * pagne), ou que des tailles (des chaussures d'une seule couleur).
 */
export function combos(d: VariantsDraft): { size: string; color: string }[] {
  const sizes = d.sizes.length > 0 ? d.sizes : [''];
  const colors = d.colors.length > 0 ? d.colors : [''];
  const out: { size: string; color: string }[] = [];
  for (const size of sizes) {
    for (const color of colors) {
      // Une combinaison sans taille NI couleur ne distingue rien de l'article :
      // la base la refuse, et elle n'aurait rien à dire à l'acheteur.
      if (size === '' && color === '') continue;
      out.push({ size, color });
    }
  }
  return out;
}

/** Ce qu'une annonce existante donne comme brouillon, pour la modification. */
export function draftFromProduct(p: Product): VariantsDraft {
  const vs = p.variants ?? [];
  if (vs.length === 0) return EMPTY_VARIANTS;
  const stock: Record<string, number | null> = {};
  for (const v of vs) stock[comboKey(v.size, v.color)] = v.stock;
  return {
    enabled: true,
    // On repart des valeurs RÉELLEMENT présentes, pas des tableaux dénormalisés
    // de l'annonce : si une combinaison a été masquée côté serveur (parce
    // qu'elle avait été commandée), elle ne doit pas ressurgir dans le
    // formulaire comme si elle existait encore.
    sizes: [...new Set(vs.map((v) => v.size).filter((x) => x !== ''))],
    colors: [...new Set(vs.map((v) => v.color).filter((x) => x !== ''))],
    stock,
  };
}

/** Le corps d'API. Vide quand l'option est décochée : le serveur efface alors. */
export function draftToBody(d: VariantsDraft) {
  if (!d.enabled) return [];
  return combos(d).map((c) => ({
    size: c.size,
    color: c.color,
    stock: d.stock[comboKey(c.size, c.color)] ?? null,
  }));
}

/**
 * Le total déclaré, pour l'afficher au vendeur pendant qu'il saisit.
 * `null` dès qu'une combinaison n'a pas de quantité : le total serait alors
 * faux, et un chiffre faux vaut moins que pas de chiffre.
 */
export function totalStock(d: VariantsDraft): number | null {
  let sum = 0;
  for (const c of combos(d)) {
    const v = d.stock[comboKey(c.size, c.color)];
    if (v === null || v === undefined) return null;
    sum += v;
  }
  return sum;
}

/** Le libellé d'une combinaison, tel qu'il s'affiche partout. */
export function variantLabel(v: Pick<ProductVariant, 'size' | 'color'>): string {
  return [v.size, v.color].filter((x) => x !== '').join(' · ');
}
