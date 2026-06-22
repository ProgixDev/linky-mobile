import { supabase } from '@/shared/lib/supabase';

import { BookingSchema, ResourceSchema, type Booking, type Resource, type Slot } from '../model/booking';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export async function getResource(resourceId: string): Promise<Result<Resource>> {
  const { data, error } = await supabase
    .from('resources')
    .select('id, title, slot_minutes')
    .eq('id', resourceId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? 'Resource not found.' };
  return { ok: true, value: ResourceSchema.parse(data) };
}

/**
 * Open slots for a resource within [from, to]. Generates fixed-length slots from
 * each availability window, then marks the ones already booked as taken.
 */
export async function listSlots(resourceId: string, from: Date, to: Date): Promise<Result<Slot[]>> {
  const res = await getResource(resourceId);
  if (!res.ok) return res;
  const slotMs = res.value.slot_minutes * 60_000;

  const [{ data: windows, error: wErr }, { data: booked, error: bErr }] = await Promise.all([
    supabase
      .from('availability')
      .select('starts_at, ends_at')
      .eq('resource_id', resourceId)
      .gte('starts_at', from.toISOString())
      .lte('ends_at', to.toISOString()),
    supabase
      .from('bookings')
      .select('slot_start')
      .eq('resource_id', resourceId)
      .eq('status', 'confirmed')
      .gte('slot_start', from.toISOString())
      .lte('slot_start', to.toISOString()),
  ]);
  if (wErr) return { ok: false, error: wErr.message };
  if (bErr) return { ok: false, error: bErr.message };

  const takenSet = new Set((booked ?? []).map((b) => b.slot_start));
  const slots: Slot[] = [];
  for (const w of windows ?? []) {
    let t = new Date(w.starts_at).getTime();
    const end = new Date(w.ends_at).getTime();
    while (t + slotMs <= end) {
      const startIso = new Date(t).toISOString();
      slots.push({ start: startIso, end: new Date(t + slotMs).toISOString(), taken: takenSet.has(startIso) });
      t += slotMs;
    }
  }
  slots.sort((a, b) => a.start.localeCompare(b.start));
  return { ok: true, value: slots };
}

/**
 * Book a slot. The unique (resource_id, slot_start) constraint means a race to
 * the same slot fails for the loser — we surface that as a friendly message.
 */
export async function book(resourceId: string, slot: Slot): Promise<Result<Booking>> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({ resource_id: resourceId, slot_start: slot.start, slot_end: slot.end })
    .select('id, resource_id, user_id, slot_start, slot_end, status')
    .single();
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'That slot was just taken. Pick another.' };
    return { ok: false, error: error.message };
  }
  return { ok: true, value: BookingSchema.parse(data) };
}

export async function cancelBooking(bookingId: string): Promise<Result<true>> {
  const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
  return error ? { ok: false, error: error.message } : { ok: true, value: true };
}

export async function myBookings(): Promise<Result<Booking[]>> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, resource_id, user_id, slot_start, slot_end, status')
    .order('slot_start', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data ?? []).map((b) => BookingSchema.parse(b)) };
}
