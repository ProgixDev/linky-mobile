import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// The cached worklist holds order refs + dropoff AREA (no secrets/credentials,
// no street address), so the plaintext tier is acceptable; see spec 001 risk 6
// (flagged for /security-review).
import { asyncStorageBackend } from '@/shared/lib/storage';

import { fetchDeliveries } from '../lib/deliveries-api';
import { DeliveryListSchema, type Delivery } from './schema';

type Status = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

type DeliveriesState = {
  items: Delivery[];
  status: Status;
  error: string | null;
  lastFetchedAt: number | null;
  /** Initial load — shows a skeleton only when there is no cache to show. */
  load: () => Promise<void>;
  /** Re-fetch (pull-to-refresh / app foreground) keeping cached rows visible. */
  refresh: () => Promise<void>;
  /** Drop in-memory + persisted cache — wired on sign-out so a driver never sees another's deliveries. */
  clearCache: () => void;
};

export const useDeliveriesStore = create<DeliveriesState>()(
  persist(
    (set, get) => ({
      items: [],
      status: 'idle',
      error: null,
      lastFetchedAt: null,

      load: async () => {
        const { status, items } = get();
        if (status === 'loading' || status === 'refreshing') return;
        set({ status: items.length > 0 ? 'refreshing' : 'loading' });
        try {
          const next = await fetchDeliveries();
          set({ items: next, status: 'success', error: null, lastFetchedAt: Date.now() });
        } catch (e) {
          // Keep any cached items visible (AC-7); surface the failure (AC-6).
          set({
            status: 'error',
            error: e instanceof Error ? e.message : 'Could not load deliveries',
          });
        }
      },

      refresh: async () => {
        const { status } = get();
        if (status === 'loading' || status === 'refreshing') return;
        set({ status: 'refreshing' });
        try {
          const next = await fetchDeliveries();
          set({ items: next, status: 'success', error: null, lastFetchedAt: Date.now() });
        } catch (e) {
          set({
            status: 'error',
            error: e instanceof Error ? e.message : 'Could not refresh deliveries',
          });
        }
      },

      clearCache: () => set({ items: [], status: 'idle', error: null, lastFetchedAt: null }),
    }),
    {
      name: 'deliveries-store-v1',
      storage: createJSONStorage(() => asyncStorageBackend),
      // Persist only the cache; never persist transient status/error.
      partialize: (s) => ({ items: s.items, lastFetchedAt: s.lastFetchedAt }),
      // Validate rehydrated data — corrupt storage must never crash the app.
      merge: (persisted, current) => {
        const p = persisted as { items?: unknown; lastFetchedAt?: unknown } | undefined;
        const parsed = DeliveryListSchema.safeParse(p?.items);
        return {
          ...current,
          items: parsed.success ? parsed.data : [],
          lastFetchedAt: typeof p?.lastFetchedAt === 'number' ? p.lastFetchedAt : null,
        };
      },
    },
  ),
);

const isActive = (d: Delivery) => d.status === 'assigned' || d.status === 'in_transit';

/**
 * Active deliveries (assigned/in_transit), newest first. Pure function — call it
 * via `useMemo(() => selectActiveDeliveries(items), [items])` so the subscription
 * returns a stable reference (don't pass it straight to the store hook).
 */
export function selectActiveDeliveries(items: Delivery[]): Delivery[] {
  return items.filter(isActive).sort((a, b) => b.createdAt - a.createdAt);
}
