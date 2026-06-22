import { z } from 'zod';

/**
 * Delivery DTO — the contract returned by the `list-livreur-deliveries` edge
 * function and rendered in the driver's worklist. Validation at the edge
 * (network response, storage rehydration) is mandatory; see
 * docs/conventions/code-style.md.
 *
 * Privacy (spec 001 AC-10): there is NO street-level `details` field here — only
 * the dropoff AREA (city/district). Zod strips unknown keys, so even if the
 * backend ever sends `details`, it never reaches the client model.
 */
// The full backend lifecycle. The list only ever DISPLAYS the active subset
// (assigned/in_transit, see `selectActiveDeliveries`); accepting the other values
// here means a drifted row is filtered out rather than failing the whole parse.
export const DeliveryStatusSchema = z.enum([
  'unassigned',
  'assigned',
  'in_transit',
  'delivered',
  'failed',
  'cancelled',
]);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

export const ACTIVE_STATUSES = ['assigned', 'in_transit'] as const;

export const DeliverySchema = z.object({
  id: z.string().min(1),
  orderRef: z.string(),
  itemTitle: z.string(),
  itemPhoto: z.string(),
  shopName: z.string(),
  dropoffCity: z.string(),
  dropoffDistrict: z.string(),
  status: DeliveryStatusSchema,
  createdAt: z.number().int().nonnegative(),
});

export type Delivery = z.infer<typeof DeliverySchema>;

export const DeliveryListSchema = z.array(DeliverySchema);
