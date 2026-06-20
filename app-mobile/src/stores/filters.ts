import { create } from 'zustand';

export type MarcheTab = 'articles' | 'immobilier';
export type PropertyTypeFilter = 'location' | 'vente' | 'terrain';

interface FiltersState {
  marcheTab: MarcheTab;
  productCategory: string; // 'all' | category name
  productSort: 'recent' | 'popular';
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
  setProductSort: (s: 'recent' | 'popular') => void;
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
  productSort: 'recent' as 'recent' | 'popular',
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

// Phase U.0 nit — used by marche's "Effacer les filtres" CTA to decide
// whether to show "Aucun résultat / Effacer les filtres" or a truly-empty
// "Aucune annonce pour le moment" copy. Returns true if any user-touched
// filter differs from its default (we ignore marcheTab + searchQuery which
// the caller manages separately).
export function hasActiveFilters(s: FiltersState, isArticles: boolean): boolean {
  if (isArticles) {
    // Phase Finish #4 — city is shared with the immobilier filters but is
    // now wired into list-products too, so a user filtering Articles by
    // city should see the "Aucun résultat / Effacer les filtres" path
    // instead of the empty-catalog copy.
    return (
      s.productCategory !== DEFAULTS.productCategory ||
      s.productSort !== DEFAULTS.productSort ||
      s.city !== DEFAULTS.city
    );
  }
  return (
    s.propertyType !== DEFAULTS.propertyType ||
    s.city !== DEFAULTS.city ||
    s.rooms !== DEFAULTS.rooms ||
    s.priceMaxGnf !== DEFAULTS.priceMaxGnf ||
    s.distanceToRoadMaxM !== DEFAULTS.distanceToRoadMaxM ||
    s.furnishedOnly !== DEFAULTS.furnishedOnly
  );
}

export const useFilters = create<FiltersState>((set) => ({
  ...DEFAULTS,
  setMarcheTab: (marcheTab) => set({ marcheTab }),
  setProductCategory: (productCategory) => set({ productCategory }),
  setProductSort: (productSort) => set({ productSort }),
  setPropertyType: (propertyType) => set({ propertyType }),
  setCity: (city) => set({ city }),
  setRooms: (rooms) => set({ rooms }),
  setPriceRange: (priceMinGnf, priceMaxGnf) => set({ priceMinGnf, priceMaxGnf }),
  setDistanceMax: (distanceToRoadMaxM) => set({ distanceToRoadMaxM }),
  setFurnishedOnly: (furnishedOnly) => set({ furnishedOnly }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  // Phase U.0 should-fix — "Effacer les filtres" from the Immobilier tab
  // used to yank the user to Articles (DEFAULTS sets marcheTab='articles').
  // Preserve the current tab so the user stays where they were.
  reset: () => set((s) => ({ ...DEFAULTS, marcheTab: s.marcheTab })),
}));
