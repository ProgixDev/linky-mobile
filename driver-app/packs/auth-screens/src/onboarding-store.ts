import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { asyncStorageBackend } from '@/shared/lib/storage';

const AnswersSchema = z.record(z.string(), z.string());

type OnboardingState = {
  completed: boolean;
  answers: Record<string, string>;
  setAnswer: (key: string, value: string) => void;
  complete: () => void;
  reset: () => void;
};

/** Multi-step onboarding answers + completion flag (non-sensitive → app storage). */
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      answers: {},
      setAnswer: (key, value) => set((s) => ({ answers: { ...s.answers, [key]: value } })),
      complete: () => set({ completed: true }),
      reset: () => set({ completed: false, answers: {} }),
    }),
    {
      name: 'onboarding-v1',
      storage: createJSONStorage(() => asyncStorageBackend),
      merge: (persisted, current) => {
        const p = persisted as { completed?: unknown; answers?: unknown } | undefined;
        const answers = AnswersSchema.safeParse(p?.answers);
        return {
          ...current,
          completed: p?.completed === true,
          answers: answers.success ? answers.data : {},
        };
      },
    },
  ),
);
