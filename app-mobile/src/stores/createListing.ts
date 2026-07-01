import { create } from 'zustand';

export type ListingKind = 'product' | 'property';

export interface PropertyPhoto {
  url: string;
  storage_path: string;
  position: number;
}

interface CreateListingState {
  kind: ListingKind;
  sellerType: 'particular' | 'merchant';
  category: string;
  title: string;
  description: string;
  priceGnf: number;
  quantity: number;
  condition: 'neuf' | 'occasion' | 'reconditionné';
  photos: string[];
  // Property-specific
  propertyType: 'location' | 'vente' | 'terrain';
  // Rental billing period — only meaningful when propertyType === 'location'.
  // 'month' maps to per_month=true (the historical default), 'day' to false.
  rentalPeriod: 'day' | 'month';
  rooms: number;
  areaSqm: number;
  city: string;
  district: string;
  distanceToRoadMeters: number;
  furnished: boolean;
  amenities: string[];
  propertyPhotos: PropertyPhoto[];
  lat?: number;
  lng?: number;
  setKind: (k: ListingKind) => void;
  set: <K extends keyof CreateListingState>(key: K, value: CreateListingState[K]) => void;
  reset: () => void;
}

// Empty defaults — these are the LIVE initial state of the create flow. Any
// non-empty value here is publishable fake data (a seller could ship the
// prefilled "iPhone 12 Pro" without typing anything). Every text field starts
// empty, every number at 0, and the flow's Continuer/Publier buttons gate on
// real values.
const DEFAULTS = {
  kind: 'product' as ListingKind,
  sellerType: 'particular' as const,
  category: '',
  title: '',
  description: '',
  priceGnf: 0,
  quantity: 1,
  condition: 'occasion' as const,
  photos: [] as string[],
  propertyType: 'location' as const,
  rentalPeriod: 'month' as 'day' | 'month',
  rooms: 0,
  areaSqm: 0,
  city: '',
  district: '',
  distanceToRoadMeters: 0,
  furnished: false,
  amenities: [] as string[],
  propertyPhotos: [] as PropertyPhoto[],
  lat: undefined as number | undefined,
  lng: undefined as number | undefined,
};

export const useCreateListing = create<CreateListingState>((set) => ({
  ...DEFAULTS,
  setKind: (kind) => set({ kind }),
  set: (key, value) => set({ [key]: value } as Partial<CreateListingState>),
  reset: () => set(DEFAULTS),
}));
