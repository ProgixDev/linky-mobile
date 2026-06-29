import { z } from 'zod';

/**
 * The slice of the `livreur-application-status` response we read for availability.
 * `is_online` is present for approved couriers; absent ⇒ treated as offline.
 */
export const AvailabilityWireSchema = z.object({
  is_online: z.boolean().optional(),
});
