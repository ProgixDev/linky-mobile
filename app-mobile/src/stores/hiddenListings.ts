import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../lib/storage';

// « Pas intéressé / Masquer » on the Découvrir feed (client 2026-07-30).
// A user hides a listing from their reels and it never comes back (this device).
// Mirrors the favorites.ts MMKV pattern: seed the Set from storage at module
// load, rewrite storage on every change (Sets serialize as arrays via JSON).
//
// V1 is LOCAL-ONLY (per-device). V1.1 upgrade: persist server-side (a
// hidden_listings table + exclude on the discover query) so a hide syncs across
// devices and survives a reinstall.

type ListingKind = 'product' | 'property';

export const hiddenKeyOf = (kind: ListingKind, id: string) => `${kind}:${id}`;

function load(): Set<string> {
  const raw = storage.getString(STORAGE_KEYS.hiddenListings);
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    // Corrupted JSON — treat as empty rather than crash at boot.
  }
  return new Set();
}

function save(keys: Set<string>) {
  storage.set(STORAGE_KEYS.hiddenListings, JSON.stringify([...keys]));
}

interface HiddenState {
  keys: Set<string>;
  hide: (kind: ListingKind, id: string) => void;
  unhide: (kind: ListingKind, id: string) => void;
  isHidden: (kind: ListingKind, id: string) => boolean;
  /** Wipes the hide-list. Same reason as favorites: it's per-ACCOUNT taste
   *  kept in a per-DEVICE store, so a new account must not start with the
   *  previous user's listings already hidden from their feed. */
  clear: () => void;
}

export const useHiddenListings = create<HiddenState>((set, get) => ({
  keys: load(),
  hide: (kind, id) =>
    set((s) => {
      const next = new Set(s.keys);
      next.add(hiddenKeyOf(kind, id));
      save(next);
      return { keys: next };
    }),
  unhide: (kind, id) =>
    set((s) => {
      const next = new Set(s.keys);
      next.delete(hiddenKeyOf(kind, id));
      save(next);
      return { keys: next };
    }),
  isHidden: (kind, id) => get().keys.has(hiddenKeyOf(kind, id)),
  clear: () => {
    storage.remove(STORAGE_KEYS.hiddenListings);
    set({ keys: new Set() });
  },
}));
