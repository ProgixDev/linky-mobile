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

// ===========================================================================
// Spec 002 — delivery detail & QR-scan handoff
// ===========================================================================

// --- Wire shape: the `get-delivery` response (camelCase + nested) ---
// Unlike the list, this carries the FULL address (street `details`) and the
// buyer's display name — the assigned driver needs both at the door (AC-1).
const DeliveryDetailWireSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  status: z.string(),
  createdAt: z.string(),
  deliveryAddress: z
    .object({
      city: z.string().nullish(),
      district: z.string().nullish(),
      details: z.string().nullish(),
    })
    .nullish(),
  order: z
    .object({
      id: z.string(),
      reference: z.string().optional(),
      productSnapshot: z
        .object({ title: z.string().optional(), photo: z.string().optional() })
        .nullish(),
      amountGnf: z.number().optional(),
      status: z.string().optional(),
    })
    .nullish(),
  buyer: z.object({ displayName: z.string().nullish() }).nullish(),
});
export type DeliveryDetailWire = z.infer<typeof DeliveryDetailWireSchema>;
export const DeliveryDetailResponseSchema = DeliveryDetailWireSchema;

// --- View model (detail screen) ---
// Carries the full street address + buyer name (only ever fetched for the
// driver's OWN assigned delivery, server-enforced) and `orderId`, which the
// scanned QR must match (AC-5) and which the confirm call sends.
export const DeliveryDetailSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  orderRef: z.string(),
  amountGnf: z.number().nonnegative(),
  itemTitle: z.string(),
  itemPhoto: z.string(),
  addressCity: z.string(),
  addressDistrict: z.string(),
  addressDetails: z.string(), // full street — revealed here, unlike the list
  buyerName: z.string(),
  status: DeliveryStatusSchema,
});
export type DeliveryDetail = z.infer<typeof DeliveryDetailSchema>;

// --- Confirm handoff ---
// Success payload from `livreur-confirm-handoff` ({ delivery, order_status });
// we only need the released order status to render the success state.
export const HandoffResultSchema = z.object({ order_status: z.string() });
export type HandoffResult = z.infer<typeof HandoffResultSchema>;

// The typed outcome `confirmHandoff()` returns to the detail state machine.
// Server error codes are MAPPED to these (never thrown) so the UI branches on a
// closed set: a money action must surface every failure honestly (spec 002).
export type HandoffOutcome =
  | { kind: 'success'; orderStatus: string }
  | { kind: 'mismatch' } // wrong/forged token, not the assigned driver, or unknown order (AC-5/AC-9)
  | { kind: 'already_done' } // order not in a releasable state — already delivered/released (AC-8)
  | { kind: 'offline' } // transport failure — nothing released while offline (AC-7)
  | { kind: 'error'; message: string };
