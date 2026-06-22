import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { makeId } from '@/shared/lib/id';
// Tasks hold no secrets/PII → the plaintext (non-secure) tier is correct here.
import { asyncStorageBackend } from '@/shared/lib/storage';

import { TaskListSchema, TaskTitleSchema, type Task } from './schema';

type TasksState = {
  tasks: Task[];
  addTask: (title: string) => { ok: true } | { ok: false; error: string };
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
};

export const useTasksStore = create<TasksState>()(
  persist(
    (set) => ({
      tasks: [],

      addTask: (title) => {
        const parsed = TaskTitleSchema.safeParse(title);
        if (!parsed.success) {
          return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid title' };
        }
        const task: Task = {
          id: makeId(),
          title: parsed.data,
          done: false,
          createdAt: Date.now(),
        };
        set((state) => ({ tasks: [task, ...state.tasks] }));
        return { ok: true as const };
      },

      toggleTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        })),

      removeTask: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

      clearCompleted: () => set((state) => ({ tasks: state.tasks.filter((t) => !t.done) })),
    }),
    {
      name: 'tasks-store-v1',
      storage: createJSONStorage(() => asyncStorageBackend),
      // Validate rehydrated data — corrupt storage must never crash the app.
      merge: (persisted, current) => {
        const parsed = TaskListSchema.safeParse(
          (persisted as { tasks?: unknown } | undefined)?.tasks,
        );
        return { ...current, tasks: parsed.success ? parsed.data : [] };
      },
    },
  ),
);

// Selectors — subscribe to slices, never the whole store, to avoid
// unnecessary re-renders (docs/architecture/state-management.md).
export const selectTasks = (s: TasksState) => s.tasks;
export const selectPendingCount = (s: TasksState) => s.tasks.filter((t) => !t.done).length;
