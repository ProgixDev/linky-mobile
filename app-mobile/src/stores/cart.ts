import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../lib/storage';
import type { CartLine } from '../data/types';

interface CartState {
  lines: CartLine[];
  /** Shop the cart currently belongs to. A cart holds articles from ONE shop. */
  shopId: string | null;
  promoCode: string | null;
  /** Adds an article. Returns 'added' | 'merged' | 'other-shop' so the caller can
   *  explain a refusal instead of silently discarding the cart. */
  add: (productId: string, shopId: string, quantity?: number) => 'added' | 'merged' | 'other-shop';
  /** Empties the cart and starts a new one on `shopId`. */
  replaceWith: (productId: string, shopId: string, quantity?: number) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  applyPromo: (code: string | null) => void;
  clear: () => void;
}

interface PersistedCart {
  lines: CartLine[];
  shopId: string | null;
  promoCode: string | null;
}

// Persisted to MMKV (client 2026-08-06 — the cart used to be pure in-memory
// Zustand state, so a force-close/reopen or an OTA reload silently wiped it).
// Mirrors favorites.ts's load/save pattern : seed from storage at module
// load, write storage on every mutation.
function loadCart(): PersistedCart {
  const raw = storage.getString(STORAGE_KEYS.cart);
  if (!raw) return { lines: [], shopId: null, promoCode: null };
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCart> | null;
    const lines = Array.isArray(parsed?.lines)
      ? parsed!.lines.filter(
          (l): l is CartLine =>
            !!l && typeof l.productId === 'string' && typeof l.quantity === 'number' && l.quantity > 0,
        )
      : [];
    return {
      lines,
      shopId: lines.length && typeof parsed?.shopId === 'string' ? parsed!.shopId : null,
      promoCode: typeof parsed?.promoCode === 'string' ? parsed!.promoCode : null,
    };
  } catch {
    // Corrupted JSON — treat as empty, don't crash the app at boot.
  }
  return { lines: [], shopId: null, promoCode: null };
}

function saveCart(c: PersistedCart) {
  storage.set(STORAGE_KEYS.cart, JSON.stringify(c));
}

// A cart maps 1:1 onto an ORDER, and the app's whole safety model is
// « 1 commande = 1 escrow = 1 vendeur = 1 livraison = 1 QR ».
//
// Several articles from the SAME shop keep every one of those invariants, so
// they are allowed (client 2026-08-05). Articles from DIFFERENT shops would
// mean one escrow owing money to two sellers — mobile money cannot split a
// payment — so the cart refuses them and the caller offers to start over.
// The database enforces the same rule (place_order_multi → MULTIPLE_SELLERS),
// so this is a UX guard, never the only line of defence.
export const useCart = create<CartState>((set, get) => {
  // Every mutation goes through this so persistence can never drift from
  // the in-memory state — no call site can forget to save.
  const persistSet = (partial: Partial<CartState>) => {
    set(partial);
    const s = get();
    saveCart({ lines: s.lines, shopId: s.shopId, promoCode: s.promoCode });
  };

  const initial = loadCart();

  return {
    lines: initial.lines,
    shopId: initial.shopId,
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
      if (s.lines.length > 0 && s.shopId && s.shopId !== shopId) return 'other-shop';
      persistSet({ lines: [...s.lines, { productId, quantity }], shopId });
      return 'added';
    },

    replaceWith: (productId, shopId, quantity = 1) =>
      persistSet({ lines: [{ productId, quantity }], shopId, promoCode: null }),

    remove: (productId) => {
      const s = get();
      const lines = s.lines.filter((l) => l.productId !== productId);
      // Emptying the cart releases the shop lock, so the next article can come
      // from anywhere.
      persistSet({ lines, shopId: lines.length ? s.shopId : null });
    },

    setQuantity: (productId, quantity) => {
      const s = get();
      const lines =
        quantity <= 0
          ? s.lines.filter((l) => l.productId !== productId)
          : s.lines.map((l) => (l.productId === productId ? { ...l, quantity } : l));
      persistSet({ lines, shopId: lines.length ? s.shopId : null });
    },

    applyPromo: (promoCode) => persistSet({ promoCode }),
    clear: () => persistSet({ lines: [], shopId: null, promoCode: null }),
  };
});
