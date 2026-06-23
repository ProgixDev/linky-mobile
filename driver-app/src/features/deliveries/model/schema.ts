import { z } from 'zod';

/**
 * Two shapes here:
 *  - the **wire** shape returned by the canonical `list-livreur-deliveries` edge
 *    function (camelCase + nested), and
 *  - the flat **view model** the UI/store/cache use.
 * The API layer (`lib/deliveries-api.ts`) parses the wire shape and maps it to the
 * view model. Validation at every edge (network, storage rehydration) is mandatory.
 *
 * Privacy (spec 001 AC-10): the view model carries dropoff AREA only (city/district).
 * The wire `deliveryAddress` also includes the street `details`, but the mapping drops
 * it so it never reaches the cache — area-only by construction.
 */

// Full backend lifecycle. The list only DISPLAYS the active subset (assigned/
// in_transit, see `selectActiveDeliveries`); other values are filtered out, not errored.
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

// --- View model (UI / store / cache) ---
export const DeliverySchema = z.object({
  id: z.string().min(1),
  orderRef: z.string(),
  itemTitle: z.string(),
  itemPhoto: z.string(),
  dropoffCity: z.string(),
  dropoffDistrict: z.string(),
  status: DeliveryStatusSchema,
  createdAt: z.number().int().nonnegative(), // epoch ms (mapped from the wire ISO string)
});

export type Delivery = z.infer<typeof DeliverySchema>;

export const DeliveryListSchema = z.array(DeliverySchema);

// --- Wire shape: the real `list-livreur-deliveries` response ---
const WireDeliverySchema = z.object({
  id: z.string(),
  status: z.string(),
  createdAt: z.string(),
  deliveryAddress: z
    .object({ city: z.string().optional(), district: z.string().optional() })
    .nullish(),
  order: z
    .object({
      reference: z.string().optional(),
      productSnapshot: z
        .object({ title: z.string().optional(), photo: z.string().optional() })
        .nullish(),
    })
    .nullish(),
});
export type WireDelivery = z.infer<typeof WireDeliverySchema>;

export const DeliveriesResponseSchema = z.object({
  deliveries: z.array(WireDeliverySchema),
  next_cursor: z.unknown().optional(),
});
