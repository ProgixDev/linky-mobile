import { apiPost, ApiError } from '@/shared/lib/api';

import {
  DeliveriesResponseSchema,
  DeliveryDetailResponseSchema,
  DeliveryStatusSchema,
  HandoffResultSchema,
  type Delivery,
  type DeliveryDetail,
  type DeliveryStatus,
  type HandoffOutcome,
} from '../model/schema';

const KNOWN_STATUSES = new Set<string>(DeliveryStatusSchema.options);

function toStatus(raw: string): DeliveryStatus {
  // Clamp an unknown/new backend status to a non-active value so a drifted row is
  // filtered out by selectActiveDeliveries rather than breaking the parse.
  return (KNOWN_STATUSES.has(raw) ? raw : 'unassigned') as DeliveryStatus;
}

/**
 * Fetch the signed-in driver's deliveries from the canonical edge function via
 * the Linky API client (`apiPost` attaches apikey + Bearer Linky-token +
 * Idempotency-Key and refreshes on 401). Identity is derived server-side from
 * the JWT — never sent by the client (spec 001 AC-9).
 *
 * The wire response (`{ deliveries, next_cursor }`, camelCase + nested) is parsed
 * and mapped to the flat view model; the street `details` is dropped here so it
 * never reaches the cache (AC-10). Active filtering/sorting happens in the store.
 */
export async function fetchDeliveries(): Promise<Delivery[]> {
  const data = await apiPost<unknown>({ path: '/list-livreur-deliveries', body: {} });

  const parsed = DeliveriesResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Unexpected deliveries response');
  }

  return parsed.data.deliveries.map((w) => ({
    id: w.id,
    orderRef: w.order?.reference ?? '',
    itemTitle: w.order?.productSnapshot?.title ?? '',
    itemPhoto: w.order?.productSnapshot?.photo ?? '',
    dropoffCity: w.deliveryAddress?.city ?? '',
    dropoffDistrict: w.deliveryAddress?.district ?? '',
    status: toStatus(w.status),
    createdAt: Date.parse(w.createdAt) || 0,
  }));
}

/**
 * Fetch ONE delivery's full detail (spec 002). Unlike the list, this carries the
 * full street address + buyer name — surfaced only for the driver's own assigned
 * delivery (server-enforced via the JWT; we send just the delivery id, AC-9). The
 * wire shape is mapped to the flat detail view model; a null buyer name falls back
 * to "Customer".
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
    status: toStatus(w.status),
  };
}

/**
 * Confirm the handoff — the irreversible money action (spec 002). Sends only the
 * order id + scanned token; the server derives the driver from the JWT and is the
 * sole authority on assignment, token validity, and idempotency (AC-9). The RPC's
 * error codes are MAPPED to a closed `HandoffOutcome` union (never re-thrown) so the
 * detail state machine surfaces every failure honestly: wrong/forged token or
 * not-the-assigned-driver → `mismatch` (nothing released, AC-5); a non-releasable
 * status → `already_done` (AC-8); a transport failure → `offline` (online-only, AC-7).
 */
export async function confirmHandoff({
  orderId,
  scanToken,
}: {
  orderId: string;
  scanToken: string;
}): Promise<HandoffOutcome> {
  try {
    const data = await apiPost<unknown>({
      path: '/livreur-confirm-handoff',
      body: { order_id: orderId, scan_token: scanToken },
    });
    const parsed = HandoffResultSchema.safeParse(data);
    if (!parsed.success) {
      return { kind: 'error', message: 'Unexpected confirm response' };
    }
    return { kind: 'success', orderStatus: parsed.data.order_status };
  } catch (e) {
    if (e instanceof ApiError) {
      switch (e.code) {
        case 'INVALID_SCAN_TOKEN':
        case 'NOT_ASSIGNED_LIVREUR':
        case 'NOT_ASSIGNED':
        case 'ORDER_NOT_FOUND':
        case 'DELIVERY_NOT_FOUND':
          return { kind: 'mismatch' };
        case 'INVALID_STATUS':
        case 'INVALID_DELIVERY_STATUS':
          return { kind: 'already_done' };
        case 'NETWORK_ERROR':
          return { kind: 'offline' };
        default:
          return { kind: 'error', message: e.message_fr || 'Confirmation failed' };
      }
    }
    // A non-ApiError throw is unexpected (not a known transport failure); surface it.
    return { kind: 'error', message: 'Confirmation failed' };
  }
}
