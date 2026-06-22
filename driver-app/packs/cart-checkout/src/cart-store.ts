import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { asyncStorageBackend } from '@/shared/lib/storage';

import { type CartLine } from './model/product';

type CartState = {
  // productId -> qty
  items: Record<string, number>;
  add: (productId: string, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: () => number;
  lines: () => CartLine[];
};

/**
 * The cart holds only product ids and quantities — NEVER prices. Prices are
 * resolved server-side at checkout (place_order). Persisted (non-sensitive) so a
 * cart survives an app restart.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: {},
      add: (productId, qty = 1) =>
        set((s) => ({ items: { ...s.items, [productId]: (s.items[productId] ?? 0) + qty } })),
      setQty: (productId, qty) =>
        set((s) => {
          const next = { ...s.items };
          if (qty <= 0) delete next[productId];
          else next[productId] = qty;
          return { items: next };
        }),
      remove: (productId) =>
        set((s) => {
          const next = { ...s.items };
          delete next[productId];
          return { items: next };
        }),
      clear: () => set({ items: {} }),
      count: () => Object.values(get().items).reduce((a, b) => a + b, 0),
      lines: () => Object.entries(get().items).map(([product_id, qty]) => ({ product_id, qty })),
    }),
    { name: 'cart', storage: createJSONStorage(() => asyncStorageBackend) },
  ),
);
