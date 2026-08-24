// Combien de cet article l'acheteur peut-il ENCORE ajouter ?
//
// Client 2026-08-24 : « si un acheteur ajoute 1 au panier, il ne peut pas en
// ajouter un autre, parce qu'il n'y a qu'une seule montre ».
//
// LE DEFAUT QUE CECI FERME : les boutons d'ajout ne regardaient que le stock
// declare, jamais ce qui se trouvait DEJA dans le panier. Et `add()` incremente
// la ligne existante. Chaque appui ajoutait donc un exemplaire de plus, sans
// aucune limite — un stock de 1 se retrouvait a 3 dans le panier. Le refus
// n'arrivait qu'au paiement, du serveur, apres que l'acheteur ait choisi son
// mode de reglement.
//
// POURQUOI UN FICHIER PARTAGE plutot que la meme condition ecrite deux fois :
// la carte de liste et la fiche produit ont deja divergé une fois — la carte
// avait une garde, la fiche n'en avait aucune. Une regle nommee une seule fois
// ne peut plus diverger.
//
// Ceci reste du CONFORT : la verite est dans place_order_multi, qui verrouille
// la ligne produit et refuse le depassement meme si le panier a ete trafique.
import { useCart } from '../stores/cart';

export interface StockGate {
  /** Quantite declaree par le vendeur. null = non renseignee, donc illimitee. */
  declared: number | null;
  /** Combien l'acheteur en a deja dans son panier. */
  inCart: number;
  /** Combien il peut encore en ajouter. null quand la quantite est illimitee. */
  remaining: number | null;
  /** Le vendeur a declare une quantite, et elle est epuisee. */
  outOfStock: boolean;
  /** Le panier atteint deja la quantite disponible — rien de plus a ajouter. */
  capReached: boolean;
  /** Faux si un ajout doit etre refuse, pour l'une ou l'autre raison. */
  canAdd: boolean;
}

export function useStockGate(product: { id: string; stock?: number | null }): StockGate {
  const inCart = useCart(
    (s) => s.lines.find((l) => l.productId === product.id)?.quantity ?? 0,
  );
  const declared = product.stock ?? null;

  // Quantite non renseignee : aucune limite. C'est le cas des annonces publiees
  // avant l'arrivee du stock, et de celles ou le vendeur laisse le champ vide.
  if (declared === null) {
    return { declared: null, inCart, remaining: null, outOfStock: false, capReached: false, canAdd: true };
  }

  const outOfStock = declared <= 0;
  const remaining = Math.max(declared - inCart, 0);
  return {
    declared,
    inCart,
    remaining,
    outOfStock,
    capReached: !outOfStock && remaining <= 0,
    canAdd: remaining > 0,
  };
}
