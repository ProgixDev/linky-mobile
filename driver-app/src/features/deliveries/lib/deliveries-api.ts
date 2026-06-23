import { makeId } from '@/shared/lib/id';
import { supabase } from '@/shared/lib/supabase';

import {
  DeliveriesResponseSchema,
  DeliveryStatusSchema,
  type Delivery,
  type DeliveryStatus,
} from '../model/schema';

const KNOWN_STATUSES = new Set<string>(DeliveryStatusSchema.options);

function toStatus(raw: string): DeliveryStatus {
  // Clamp an unknown/new backend status to a non-active value so a drifted row is
  // filtered out by selectActiveDeliveries rather than breaking the parse.
  return (KNOWN_STATUSES.has(raw) ? raw : 'unassigned') as DeliveryStatus;
}

/**
 * Fetch the signed-in driver's deliveries from the canonical edge function.
 *
 * - Identity is NEVER sent by the client — `functions.invoke` attaches the session
 *   JWT and the function derives `livreur_id` from it (spec 001 AC-9).
 * - The backend wrapper requires an `Idempotency-Key` header on every POST.
 * - The wire response (`{ deliveries, next_cursor }`, camelCase + nested) is parsed
 *   and mapped to the flat view model; the street `details` is dropped here so it
 *   never reaches the cache (AC-10). Active filtering/sorting happens in the store.
 */
export async function fetchDeliveries(): Promise<Delivery[]> {
  const { data, error } = await supabase.functions.invoke('list-livreur-deliveries', {
    body: {},
    headers: { 'Idempotency-Key': makeId() },
  });

  if (error) {
    throw new Error(error.message ?? 'Could not load deliveries');
  }

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
