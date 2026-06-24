import { ApiError, apiPost } from '@/shared/lib/api';

import {
  DeliveryDetailResponseSchema,
  DeliveryListResponseSchema,
  DeliveryStatusSchema,
  HandoffResultSchema,
  type Delivery,
  type DeliveryDetail,
  type DeliveryListItemWire,
  type HandoffOutcome,
} from '../model/schema';

// Clamp an unknown/new backend status to a non-active value so a drifted row is filtered
// out by selectActiveDeliveries rather than breaking the parse — single source of truth
// is DeliveryStatusSchema (no duplicate status list here).
const statusOrUnassigned = DeliveryStatusSchema.catch('unassigned');

// Map a deployed list row (nested camelCase) → the flat worklist view model. The street
// `details` was already stripped by the wire schema (AC-10); the backend exposes no shop
// name on the list, so `shopName` is left empty (the row hides it when absent).
function mapListItem(w: DeliveryListItemWire): Delivery {
  return {
    id: w.id,
    orderRef: w.order?.reference ?? '',
    itemTitle: w.order?.productSnapshot?.title ?? '',
    itemPhoto: w.order?.productSnapshot?.photo ?? '',
    shopName: '',
    dropoffCity: w.deliveryAddress?.city ?? '',
    dropoffDistrict: w.deliveryAddress?.district ?? '',
    status: statusOrUnassigned.parse(w.status),
    createdAt: w.createdAt ? Date.parse(w.createdAt) || 0 : 0,
  };
}

/**
 * Fetch the signed-in driver's deliveries from the Linky edge function.
 *
 * The request carries NO driver identity — `apiPost` attaches the Linky access
 * token (self-rolled JWT) and the function derives `livreur_id` from it (spec 001
 * AC-9). The deployed backend returns a paginated `{ deliveries, next_cursor }`
 * envelope of nested rows, validated at this edge and mapped to the flat model;
 * `selectActiveDeliveries` then filters to assigned/in_transit. (The active worklist
 * is small, so the first page suffices — cursor paging is unused for now.)
 */
export async function fetchDeliveries(): Promise<Delivery[]> {
  const data = await apiPost<unknown>({ path: '/list-livreur-deliveries' });

  const parsed = DeliveryListResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Unexpected deliveries response');
  }

  return parsed.data.deliveries.map(mapListItem);
}

/**
 * Fetch ONE delivery's full detail (spec 002). Unlike the list, this carries the full
 * street address + buyer name — surfaced only for the driver's own assigned delivery
 * (server-enforced via the JWT; we send just the delivery id, AC-9). The wire shape is
 * Zod-parsed at this edge and mapped to the flat detail view model; a null buyer name
 * falls back to "Customer".
 */
export async function getDelivery(deliveryId: string): Promise<DeliveryDetail> {
  const data = await apiPost<unknown>({ path: '/get-delivery', body: { delivery_id: deliveryId } });

  const parsed = DeliveryDetailResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Unexpected delivery response');
  }
  const w = parsed.data;
  const buyerName = w.buyer?.displayName?.trim();

  return {
    id: w.id,
    orderId: w.orderId,
    orderRef: w.order?.reference ?? '',
    amountGnf: w.order?.amountGnf ?? 0,
    itemTitle: w.order?.productSnapshot?.title ?? '',
    itemPhoto: w.order?.productSnapshot?.photo ?? '',
    addressCity: w.deliveryAddress?.city ?? '',
    addressDistrict: w.deliveryAddress?.district ?? '',
    addressDetails: w.deliveryAddress?.details ?? '',
    buyerName: buyerName ? buyerName : 'Customer',
    status: statusOrUnassigned.parse(w.status),
  };
}

/**
 * Confirm the handoff — the irreversible money action (spec 002). Sends only the order
 * id + scanned token; the server derives the driver from the JWT and is the sole
 * authority on assignment, token validity, and idempotency (AC-9). Server error codes
 * are MAPPED to a closed `HandoffOutcome` union (never re-thrown) so the detail state
 * machine surfaces every failure honestly: a wrong/forged token or not-the-assigned-
 * driver → `mismatch` (nothing released, AC-5); a non-releasable status → `already_done`
 * (AC-8); a transport failure → `offline` (online-only, AC-7).
 *
 * `idempotencyKey` should be STABLE across retries of the same handoff (the caller mints
 * it once at scan time): a retry then replays the server's cached result rather than
 * racing the RPC status gate.
 */
export async function confirmHandoff({
  orderId,
  scanToken,
  idempotencyKey,
}: {
  orderId: string;
  scanToken: string;
  idempotencyKey?: string;
}): Promise<HandoffOutcome> {
  try {
    const data = await apiPost<unknown>({
      path: '/livreur-confirm-handoff',
      body: { order_id: orderId, scan_token: scanToken },
      idempotencyKey,
    });
    const parsed = HandoffResultSchema.safeParse(data);
    if (!parsed.success) {
      return { kind: 'error', message: 'Unexpected confirm response' };
    }
    return { kind: 'success', orderStatus: parsed.data.order_status };
  } catch (e) {
    if (!(e instanceof ApiError)) {
      return { kind: 'error', message: 'Confirmation failed' };
    }
    // A transport/fetch failure (no connection) — nothing released while offline (AC-7).
    if (e.status === 0 || e.code === 'NETWORK_ERROR') {
      return { kind: 'offline' };
    }
    switch (e.code) {
      // Wrong/forged token, not the assigned driver, or a genuinely unknown order/delivery
      // → mismatch (nothing released, AC-5). A retry AFTER a successful release does NOT
      // land here: the order row persists as `released`, so the RPC raises INVALID_STATUS
      // (→ already_done) — *_NOT_FOUND only fires for ids that never existed.
      case 'INVALID_SCAN_TOKEN':
      case 'NOT_ASSIGNED_LIVREUR':
      case 'NOT_ASSIGNED':
      case 'ORDER_NOT_FOUND':
      case 'DELIVERY_NOT_FOUND':
        return { kind: 'mismatch' };
      case 'INVALID_STATUS':
      case 'INVALID_DELIVERY_STATUS':
        return { kind: 'already_done' };
      default:
        // Curated French copy only — never surface a raw transport string to the
        // money-action error card (it can leak internals).
        return { kind: 'error', message: e.message_fr || 'Confirmation failed' };
    }
  }
}
