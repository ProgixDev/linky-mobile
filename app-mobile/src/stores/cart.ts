import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../lib/storage';
import type { CartLine } from '../data/types';

interface CartState {
  lines: CartLine[];
  promoCode: string | null;
  /** Ajoute un article. Renvoie 'added' ou 'merged' — plus jamais de refus :
   *  depuis 2026-08-13 le panier accepte plusieurs boutiques. */
  add: (productId: string, shopId: string, quantity?: number) => 'added' | 'merged';
  /** Vide le panier et repart sur cet article. Conserve pour les appelants qui
   *  proposaient « vider et ajouter » ; plus utilise dans le parcours normal. */
  replaceWith: (productId: string, shopId: string, quantity?: number) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  /** Retire toutes les lignes d'une boutique — appele apres une commande
   *  reussie, pour ne vider QUE le groupe paye et laisser les autres en place. */
  removeShop: (shopId: string) => void;
  applyPromo: (code: string | null) => void;
  clear: () => void;
}

interface PersistedCart {
  lines: CartLine[];
  promoCode: string | null;
}

// Persiste dans MMKV (client 2026-08-06 — le panier etait purement en memoire,
// une fermeture forcee ou un rechargement OTA le vidait en silence).
//
// Migration : les paniers enregistres avant le multi-boutiques n'ont pas de
// shopId sur leurs lignes, mais en portaient un au niveau du panier. On le
// recopie sur chaque ligne, sinon un panier existant se retrouverait dans un
// groupe « boutique inconnue » au premier lancement.
function loadCart(): PersistedCart {
  const raw = storage.getString(STORAGE_KEYS.cart);
  if (!raw) return { lines: [], promoCode: null };
  try {
    const parsed = JSON.parse(raw) as (Partial<PersistedCart> & { shopId?: string }) | null;
    const legacyShopId = typeof parsed?.shopId === 'string' ? parsed.shopId : undefined;
    const lines = Array.isArray(parsed?.lines)
      ? parsed!.lines
          .filter(
            (l): l is CartLine =>
              !!l && typeof l.productId === 'string' && typeof l.quantity === 'number' && l.quantity > 0,
          )
          .map((l) => ({ ...l, shopId: l.shopId ?? legacyShopId }))
      : [];
    return {
      lines,
      promoCode: typeof parsed?.promoCode === 'string' ? parsed!.promoCode : null,
    };
  } catch {
    // JSON corrompu — panier vide plutot qu'un plantage au demarrage.
  }
  return { lines: [], promoCode: null };
}

function saveCart(c: PersistedCart) {
  storage.set(STORAGE_KEYS.cart, JSON.stringify(c));
}

// Le panier peut contenir PLUSIEURS boutiques (client 2026-08-13), mais une
// COMMANDE reste mono-boutique : l'invariant « 1 commande = 1 escrow =
// 1 vendeur = 1 livraison = 1 QR » est intact. L'ecran du panier regroupe par
// boutique et on paie un groupe a la fois — un paiement mobile money ne peut de
// toute facon pas etre reparti entre deux vendeurs.
//
// La base impose la meme regle (place_order_multi -> MULTIPLE_SELLERS) : un
// panier trafique melangeant deux boutiques dans une commande est refuse la-bas.
export const useCart = create<CartState>((set, get) => {
  // Toute mutation passe par la pour que la persistance ne puisse jamais
  // diverger de l'etat en memoire.
  const persistSet = (partial: Partial<CartState>) => {
    set(partial);
    const s = get();
    saveCart({ lines: s.lines, promoCode: s.promoCode });
  };

  const initial = loadCart();

  return {
    lines: initial.lines,
    promoCode: initial.promoCode,

    add: (productId, shopId, quantity = 1) => {
      const s = get();
      const existing = s.lines.find((l) => l.productId === productId);
      if (existing) {
        persistSet({
          lines: s.lines.map((l) =>
            l.productId === productId ? { ...l, quantity: l.quantity + quantity } : l,
          ),
        });
        return 'merged';
      }
      persistSet({ lines: [...s.lines, { productId, quantity, shopId }] });
      return 'added';
    },

    replaceWith: (productId, shopId, quantity = 1) =>
      persistSet({ lines: [{ productId, quantity, shopId }], promoCode: null }),

    remove: (productId) =>
      persistSet({ lines: get().lines.filter((l) => l.productId !== productId) }),

    setQuantity: (productId, quantity) => {
      const s = get();
      persistSet({
        lines:
          quantity <= 0
            ? s.lines.filter((l) => l.productId !== productId)
            : s.lines.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
      });
    },

    removeShop: (shopId) =>
      persistSet({ lines: get().lines.filter((l) => l.shopId !== shopId) }),

    applyPromo: (promoCode) => persistSet({ promoCode }),
    clear: () => persistSet({ lines: [], promoCode: null }),
  };
});
