import { create } from 'zustand';

import { fetchAvailability, setAvailability } from '../lib/availability-api';

type AvailabilityState = {
  /** null until the first load resolves; then mirrors users.is_online. */
  online: boolean | null;
  loading: boolean;
  pending: boolean;
  error: string | null;
  load: () => Promise<void>;
  setOnline: (value: boolean) => Promise<void>;
};

/**
 * Livreur availability. `online` mirrors users.is_online (read via
 * livreur-application-status, written via set-livreur-availability). setOnline is
 * OPTIMISTIC — the pill flips instantly and reverts only if the server rejects.
 */
export const useAvailabilityStore = create<AvailabilityState>((set, get) => ({
  online: null,
  loading: false,
  pending: false,
  error: null,

  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    const r = await fetchAvailability();
    set({ loading: false, online: r.ok ? r.online : get().online, error: r.ok ? null : 'load' });
  },

  setOnline: async (value) => {
    if (get().pending) return;
    const prev = get().online;
    set({ pending: true, online: value, error: null });
    const ok = await setAvailability(value);
    set(ok ? { pending: false } : { pending: false, online: prev, error: 'save' });
  },
}));
