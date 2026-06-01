import { create } from 'zustand';

interface FavoritesState {
  productIds: Set<string>;
  propertyIds: Set<string>;
  toggleProduct: (id: string) => void;
  toggleProperty: (id: string) => void;
  isProductFav: (id: string) => boolean;
  isPropertyFav: (id: string) => boolean;
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  productIds: new Set(),
  propertyIds: new Set(),
  toggleProduct: (id) =>
    set((s) => {
      const next = new Set(s.productIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { productIds: next };
    }),
  toggleProperty: (id) =>
    set((s) => {
      const next = new Set(s.propertyIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { propertyIds: next };
    }),
  isProductFav: (id) => get().productIds.has(id),
  isPropertyFav: (id) => get().propertyIds.has(id),
}));
