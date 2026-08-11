import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../lib/storage';

// Pre-prod: persist favorite ids to MMKV so a kill / re-open / OTA reload
// doesn't wipe everything the user hearted. Mirrors the prefs.ts pattern :
// seed the in-memory Set from storage at module load, write storage on every
// toggle. Sets serialize as arrays via JSON (Set itself is not JSON-friendly).
//
// V1.1 will move favorites server-side (a useFavorites query backed by
// is_favorited on get-product / get-property + a property-favorite-toggle
// fn mirroring product-favorite-toggle). Until then the MMKV cache is the
// only source of truth on this device.
function loadIds(key: string): Set<string> {
  const raw = storage.getString(key);
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return new Set(arr.filter((x): x is string => typeof x === 'string'));
    }
  } catch {
    // Corrupted JSON — treat as empty. Don't propagate the throw : a single
    // bad row should not crash the app at boot.
  }
  return new Set();
}

function saveIds(key: string, ids: Set<string>) {
  storage.set(key, JSON.stringify([...ids]));
}

interface FavoritesState {
  productIds: Set<string>;
  propertyIds: Set<string>;
  toggleProduct: (id: string) => void;
  toggleProperty: (id: string) => void;
  // Idempotent SET (client 2026-08-06). The Découvrir reel now reconciles this
  // store with the server's own `favorited` verdict after every tap. Doing
  // that with the TOGGLE methods above is inherently racy — two toggles meant
  // to both "turn on" can cancel each other out if one is a stray retry — so
  // callers that already know the target boolean (server response, revert-on-
  // error) must use these instead.
  setProductFav: (id: string, value: boolean) => void;
  setPropertyFav: (id: string, value: boolean) => void;
  isProductFav: (id: string) => boolean;
  isPropertyFav: (id: string) => boolean;
  /** Wipes every favorite from memory AND storage. Called on sign-out and on
   *  account switch — favorites are per-ACCOUNT data living in a per-DEVICE
   *  store, so without this a brand-new account inherits the previous user's
   *  hearts (client 2026-08-07: fresh account already showed 3 articles +
   *  2 logements in Favoris). */
  clear: () => void;
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  productIds: loadIds(STORAGE_KEYS.favoriteProducts),
  propertyIds: loadIds(STORAGE_KEYS.favoriteProperties),
  toggleProduct: (id) =>
    set((s) => {
      const next = new Set(s.productIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIds(STORAGE_KEYS.favoriteProducts, next);
      return { productIds: next };
    }),
  toggleProperty: (id) =>
    set((s) => {
      const next = new Set(s.propertyIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIds(STORAGE_KEYS.favoriteProperties, next);
      return { propertyIds: next };
    }),
  setProductFav: (id, value) =>
    set((s) => {
      if (s.productIds.has(id) === value) return s; // no-op, skip a useless persist+render
      const next = new Set(s.productIds);
      if (value) next.add(id); else next.delete(id);
      saveIds(STORAGE_KEYS.favoriteProducts, next);
      return { productIds: next };
    }),
  setPropertyFav: (id, value) =>
    set((s) => {
      if (s.propertyIds.has(id) === value) return s;
      const next = new Set(s.propertyIds);
      if (value) next.add(id); else next.delete(id);
      saveIds(STORAGE_KEYS.favoriteProperties, next);
      return { propertyIds: next };
    }),
  isProductFav: (id) => get().productIds.has(id),
  isPropertyFav: (id) => get().propertyIds.has(id),
  clear: () => {
    storage.remove(STORAGE_KEYS.favoriteProducts);
    storage.remove(STORAGE_KEYS.favoriteProperties);
    set({ productIds: new Set(), propertyIds: new Set() });
  },
}));
