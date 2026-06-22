import { useCallback, useEffect, useState } from 'react';

import { book, listSlots } from './data/booking-repo';
import { type Slot } from './model/booking';

/**
 * Slots for a resource on a given day, plus a `reserve` action. After a
 * successful booking (or a lost race) it reloads so the taken state is accurate.
 */
export function useBooking(resourceId: string, day: Date) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date(day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(day);
    to.setHours(23, 59, 59, 999);
    const r = await listSlots(resourceId, from, to);
    if (r.ok) setSlots(r.value);
    else setError(r.error);
    setLoading(false);
  }, [resourceId, day]);

  useEffect(() => {
    void load();
  }, [load]);

  const reserve = async (slot: Slot) => {
    setError(null);
    const r = await book(resourceId, slot);
    if (!r.ok) setError(r.error);
    await load(); // refresh taken state either way
    return r.ok;
  };

  return { slots, loading, error, reserve, reload: load };
}
