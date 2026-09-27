// La matrice des déclinaisons, telle que le téléphone l'envoie — partagée par
// product-create et product-update.
//
// Ce module ne valide que la FORME. Les invariants qui engagent du stock ou de
// l'argent vivent en base : unicité de (annonce, taille, couleur), refus de
// convertir une annonce qui a des commandes en vol (`LIVE_ORDERS`), et la garde
// qui interdit un prix sur une partie seulement des combinaisons. Une règle
// qu'on peut contourner en appelant l'API autrement n'est pas une règle.

export interface VariantBody {
  size?: string;
  color?: string;
  /** null = quantité non déclarée, donc pas de limite sur cette combinaison. */
  stock?: number | null;
}

/** Le plafond. Six tailles × trois couleurs = 18 : l'exemple du client tient. */
export const MAX_VARIANTS = 20;

/** Le plafond de quantité d'UNE combinaison. Identique à celui de products.stock
 *  dans product-create / product-update — la table fille ne doit pas être une
 *  porte dérobée vers un stock que l'API refuserait en direct. */
export const MAX_VARIANT_STOCK = 100_000;

export function validVariants(x: unknown): boolean {
  if (x === undefined) return true;
  if (!Array.isArray(x) || x.length > MAX_VARIANTS) return false;

  const seen = new Set<string>();
  for (const raw of x) {
    if (typeof raw !== 'object' || raw === null) return false;
    const v = raw as Record<string, unknown>;

    const size = typeof v.size === 'string' ? v.size.trim() : '';
    const color = typeof v.color === 'string' ? v.color.trim() : '';
    if (v.size !== undefined && typeof v.size !== 'string') return false;
    if (v.color !== undefined && typeof v.color !== 'string') return false;
    if (size.length > 40 || color.length > 40) return false;
    // Une combinaison sans taille NI couleur ne distingue rien de l'article.
    if (size === '' && color === '') return false;

    if (v.stock !== undefined && v.stock !== null) {
      if (typeof v.stock !== 'number' || !Number.isInteger(v.stock) || v.stock < 0) return false;
      // LE MEME PLAFOND QUE products.stock, ET POUR LA MEME RAISON.
      //
      // Il manquait ici, et la colonne fille est un `integer` : 9999999999
      // faisait echouer le cast dans replace_product_variants (« value out of
      // range »), message qu'aucune traduction ne reconnait, donc 500 opaque —
      // et sur une CREATION, l'annonce etait deja publiee a ce moment-la.
      // Trois combinaisons a 999999999 passaient chacune le cast mais faisaient
      // deborder la somme de la remontee, cette fois depuis un declencheur.
      //
      // Accessoirement, sans plafond ici, 20 combinaisons a 50 000 000 posaient
      // products.stock a un milliard : le plafond de l'annonce simple se
      // contournait par la table fille.
      if (v.stock > MAX_VARIANT_STOCK) return false;
    }

    // Deux lignes identiques se contrediraient ; la clé primaire les refuserait
    // avec un message que le vendeur ne pourrait pas interpréter.
    const key = size + '\u0000' + color;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/** La forme attendue par replace_product_variants, valeurs déjà nettoyées. */
export function variantsPayload(x: VariantBody[] | undefined) {
  return (x ?? []).map((v) => ({
    size: (v.size ?? '').trim(),
    color: (v.color ?? '').trim(),
    // La RPC lit `nullif(x ->> 'stock', '')::int` : une chaîne vide y devient
    // null, donc « non déclaré ». On envoie donc '' et non 0, qui voudrait dire
    // « en rupture ».
    stock: v.stock === undefined || v.stock === null ? '' : String(v.stock),
  }));
}
