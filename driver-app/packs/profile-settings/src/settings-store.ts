import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { asyncStorageBackend } from '@/shared/lib/storage';

const SettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  pushNotifications: z.boolean(),
  emailNotifications: z.boolean(),
  reduceMotion: z.boolean(),
});
type Settings = z.infer<typeof SettingsSchema>;

const DEFAULTS: Settings = {
  theme: 'system',
  pushNotifications: true,
  emailNotifications: true,
  reduceMotion: false,
};

type SettingsState = Settings & {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
};

/** Local user preferences (non-sensitive → app storage), with validated rehydration. */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<Settings>),
      reset: () => set(DEFAULTS),
    }),
    {
      name: 'settings-v1',
      storage: createJSONStorage(() => asyncStorageBackend),
      merge: (persisted, current) => {
        const parsed = SettingsSchema.partial().safeParse(persisted);
        return { ...current, ...(parsed.success ? parsed.data : {}) };
      },
    },
  ),
);
