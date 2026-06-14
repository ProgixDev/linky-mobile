import { create } from 'zustand';
import type { CartLine } from '../data/types';

interface CartState {
  lines: CartLine[];
  promoCode: string | null;
  add: (productId: string, quantity?: number) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  applyPromo: (code: string | null) => void;
  clear: () => void;
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  promoCode: null,
  add: (productId, quantity = 1) =>
    set((s) => {
      const existing = s.lines.find((l) => l.productId === productId);
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.productId === productId ? { ...l, quantity: l.quantity + quantity } : l,
          ),
        };
      }
      // V1 escrow is one order per checkout: place-order takes a single
      // productId and the payment intent is created for that one product.
      // A multi-line cart let checkout display a summed total while only the
      // first line was ever ordered/charged — so the cart holds a single line
      // and adding a different product replaces it instead of silently piling up.
      return { lines: [{ productId, quantity }] };
    }),
  remove: (productId) =>
    set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
  setQuantity: (productId, quantity) =>
    set((s) => ({
      lines:
        quantity <= 0
          ? s.lines.filter((l) => l.productId !== productId)
          : s.lines.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
    })),
  applyPromo: (promoCode) => set({ promoCode }),
  clear: () => set({ lines: [], promoCode: null }),
}));
