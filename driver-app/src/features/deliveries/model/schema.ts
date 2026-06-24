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

// --- Wire shape: the deployed `list-livreur-deliveries` response ---
// The live Linky backend returns a PAGINATED ENVELOPE `{ deliveries, next_cursor }` of
// NESTED camelCase rows (createdAt is an ISO string, the order is a nested object, and
// there is no shop join) — NOT the flat array above. It is mapped to the flat `Delivery`
// worklist model in lib/deliveries-api.ts. Privacy (AC-10): the list must not reveal the
// street `details`; this wire schema maps only city/district and Zod strips the rest, so
// even if the address blob carries `details` it never reaches the client model.
const DeliveryListItemWireSchema = z.object({
  id: z.string(),
  status: z.string(),
  createdAt: z.string().optional(),
  deliveryAddress: z
    .object({ city: z.string().nullish(), district: z.string().nullish() })
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
export type DeliveryListItemWire = z.infer<typeof DeliveryListItemWireSchema>;
export const DeliveryListResponseSchema = z.object({
  deliveries: z.array(DeliveryListItemWireSchema),
  next_cursor: z.unknown().nullish(),
});

// ===========================================================================
// Spec 002 — delivery detail & QR-scan handoff
// ===========================================================================

// --- Wire shape: the `get-delivery` response (camelCase + nested) ---
// Unlike the list, this carries the FULL address (street `details`) and the buyer's
// display name — the assigned driver needs both at the door (AC-1). Validated at the
// network edge in lib/deliveries-api.ts, then mapped to the flat view model below.
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
// Carries the full street address + buyer name (only ever fetched for the driver's OWN
// assigned delivery, server-enforced) and `orderId`, which the scanned QR must match
// (AC-5) and which the confirm call sends.
export const DeliveryDetailSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  orderRef: z.string(),
  amountGnf: z.number().nonnegative(),
  itemTitle: z.string(),
  itemPhoto: z.string(),
  addressCity: z.string(),
  addressDistrict: z.string(),
  addressDetails: z.string(), // full street — revealed here, unlike the list (AC-10)
  buyerName: z.string(),
  status: DeliveryStatusSchema,
});
export type DeliveryDetail = z.infer<typeof DeliveryDetailSchema>;

// --- Confirm handoff ---
// Success payload from `livreur-confirm-handoff` ({ delivery, order_status }); we only
// need the released order status to render the success state.
export const HandoffResultSchema = z.object({ order_status: z.string() });
export type HandoffResult = z.infer<typeof HandoffResultSchema>;

// The typed outcome `confirmHandoff()` returns to the detail state machine. Server error
// codes are MAPPED to these (never thrown) so the UI branches on a closed set — a money
// action must surface every failure honestly (spec 002).
export type HandoffOutcome =
  | { kind: 'success'; orderStatus: string }
  | { kind: 'mismatch' } // wrong/forged token, not the assigned driver, or unknown order (AC-5/AC-9)
  | { kind: 'already_done' } // order not in a releasable state — already delivered/released (AC-8)
  | { kind: 'offline' } // transport failure — nothing released while offline (AC-7)
  | { kind: 'error'; message: string };
