import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { asyncStorageBackend } from '@/shared/lib/storage';

const HistoryItemSchema = z.object({
  barcode: z.string(),
  name: z.string().nullable(),
  nutriScore: z.string().nullable(),
  scannedAt: z.number().int().positive(),
});
type HistoryItem = z.infer<typeof HistoryItemSchema>;
const HistoryListSchema = z.array(HistoryItemSchema);

type ScanState = {
  history: HistoryItem[];
  addToHistory: (item: HistoryItem) => void;
  clear: () => void;
};

/** Recent scans (deduped, capped). Non-sensitive → plaintext app storage is fine. */
export const useScanStore = create<ScanState>()(
  persist(
    (set) => ({
      history: [],
      addToHistory: (item) =>
        set((s) => ({
          history: [item, ...s.history.filter((h) => h.barcode !== item.barcode)].slice(0, 50),
        })),
      clear: () => set({ history: [] }),
    }),
    {
      name: 'scan-history-v1',
      storage: createJSONStorage(() => asyncStorageBackend),
      merge: (persisted, current) => {
        const parsed = HistoryListSchema.safeParse(
          (persisted as { history?: unknown } | undefined)?.history,
        );
        return { ...current, history: parsed.success ? parsed.data : [] };
      },
    },
  ),
);
