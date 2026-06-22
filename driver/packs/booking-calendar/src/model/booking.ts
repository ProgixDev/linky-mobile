import { z } from 'zod';

export const ResourceSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slot_minutes: z.number().int(),
});
export type Resource = z.infer<typeof ResourceSchema>;

export const BookingSchema = z.object({
  id: z.string().uuid(),
  resource_id: z.string().uuid(),
  user_id: z.string().uuid(),
  slot_start: z.string(),
  slot_end: z.string(),
  status: z.enum(['confirmed', 'cancelled']),
});
export type Booking = z.infer<typeof BookingSchema>;

/** A bookable time slot derived from availability minus existing bookings. */
export type Slot = { start: string; end: string; taken: boolean };
