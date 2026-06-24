import { create } from 'zustand';

import { fetchProfile, saveProfile } from '../lib/profile-api';
import { ProfileEditSchema, type ProfileEdit, type ProfileView } from './schema';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type ProfileState = {
  view: ProfileView | null;
  status: Status;
  error: string | null;
  saving: boolean;
  /** Feedback after a save attempt (success or the stub "coming soon"). */
  saveNote: string | null;
  load: () => Promise<void>;
  save: (input: ProfileEdit) => Promise<void>;
  clearNote: () => void;
};

/**
 * Driver profile state. Reads the snapshot from the livreur application; the save
 * is stubbed until the backend profile-update endpoint ships (see profile-api).
 */
export const useProfileStore = create<ProfileState>((set) => ({
  view: null,
  status: 'idle',
  error: null,
  saving: false,
  saveNote: null,

  load: async () => {
    set((s) => ({ status: s.view ? 'ready' : 'loading', error: null }));
    const r = await fetchProfile();
    if (r.ok) {
      set({ view: r.view, status: 'ready', error: null });
    } else {
      // Keep any loaded view; only a cold failure surfaces the error screen.
      set((s) =>
        s.view ? { status: 'ready', error: r.message } : { status: 'error', error: r.message },
      );
    }
  },

  save: async (input) => {
    const parsed = ProfileEditSchema.safeParse(input);
    if (!parsed.success) {
      set({ saveNote: parsed.error.issues[0]?.message ?? 'Vérifie les informations saisies.' });
      return;
    }
    set({ saving: true, saveNote: null });
    const r = await saveProfile(parsed.data);
    set({ saving: false, saveNote: r.ok ? 'Profil mis à jour.' : r.message });
  },

  clearNote: () => set({ saveNote: null }),
}));
