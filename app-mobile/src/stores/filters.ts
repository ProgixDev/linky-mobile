import { create } from 'zustand';

export type MarcheTab = 'articles' | 'immobilier';
export type PropertyTypeFilter = 'location' | 'vente' | 'terrain';

interface FiltersState {
  marcheTab: MarcheTab;
  productCategory: string; // 'all' | category name
  propertyType: PropertyTypeFilter;
  city: string | null;
  rooms: string | null; // 'studio' | '1' | '2' | '3' | '4+'
  priceMinGnf: number;
  priceMaxGnf: number;
  distanceToRoadMaxM: number;
  furnishedOnly: boolean;
  searchQuery: string;
  setMarcheTab: (t: MarcheTab) => void;
  setProductCategory: (c: string) => void;
  setPropertyType: (t: PropertyTypeFilter) => void;
  setCity: (c: string | null) => void;
  setRooms: (r: string | null) => void;
  setPriceRange: (min: number, max: number) => void;
  setDistanceMax: (m: number) => void;
  setFurnishedOnly: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  reset: () => void;
}

const DEFAULTS = {
  marcheTab: 'articles' as MarcheTab,
  productCategory: 'all',
  propertyType: 'location' as PropertyTypeFilter,
  city: null as string | null,
  rooms: null as string | null,
  // 0 = « Tout » : the query layer sends `value || undefined`, so 0 means no
  // server-side filter. Non-zero defaults here silently HIDE inventory on
  // first load (a 6M GNF/month property never appeared until the user
  // touched the filter sheet) and made « Effacer » restore those same
  // invisible filters instead of clearing them.
  priceMinGnf: 0,
  priceMaxGnf: 0,
  distanceToRoadMaxM: 0,
  furnishedOnly: false,
  searchQuery: '',
};

export const useFilters = create<FiltersState>((set) => ({
  ...DEFAULTS,
  setMarcheTab: (marcheTab) => set({ marcheTab }),
  setProductCategory: (productCategory) => set({ productCategory }),
  setPropertyType: (propertyType) => set({ propertyType }),
  setCity: (city) => set({ city }),
  setRooms: (rooms) => set({ rooms }),
  setPriceRange: (priceMinGnf, priceMaxGnf) => set({ priceMinGnf, priceMaxGnf }),
  setDistanceMax: (distanceToRoadMaxM) => set({ distanceToRoadMaxM }),
  setFurnishedOnly: (furnishedOnly) => set({ furnishedOnly }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  reset: () => set(DEFAULTS),
}));
