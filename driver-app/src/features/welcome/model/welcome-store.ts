import { create } from 'zustand';

import { appStorage } from '@/shared/lib/storage';

// Non-sensitive UI flag → appStorage (plaintext) is correct.
const SEEN_KEY = 'welcome.seen.v1';

type WelcomeState = {
  /** null = not yet hydrated from storage; true/false once known. */
  seen: boolean | null;
  /** Load the once-per-install flag. Fails closed to `false` (show welcome). */
  hydrate: () => Promise<void>;
  /** Mark the welcome as seen (persisted) so it never shows again on this install. */
  markSeen: () => Promise<void>;
};

/**
 * Welcome gate state: has this install seen the animated welcome + get-started?
 * Drives the pre-auth routing in the root layout (see use-welcome-gate). The
 * server is not involved — this is a local first-run flag.
 */
export const useWelcomeStore = create<WelcomeState>((set) => ({
  seen: null,
  hydrate: async () => {
    try {
      const v = await appStorage.get(SEEN_KEY);
      set({ seen: v === '1' });
    } catch {
      // Storage read failed — show the welcome rather than hang on `null`.
      set({ seen: false });
    }
  },
  markSeen: async () => {
    set({ seen: true });
    try {
      await appStorage.set(SEEN_KEY, '1');
    } catch {
      // Non-fatal: worst case the welcome shows once more next launch.
    }
  },
}));
