// Phase X.6b — seller marks an order as shipped.
//
// Atomic conditional transition mirroring visit-respond : .eq('status','paid')
// gate inside the UPDATE so a double-tap or a concurrent confirm-receipt race
// can't flip an already-released order back to 'preparing'.
//
// Tracking number is OPTIONAL (≤ 60 chars). Many Guinea deliveries are
// hand-carried — forcing a tracking number would shut a real V1 segment out.
// Persistence by APPENDING to orders.events JSON, NO MIGRATION required :
// the events column already exists (`jsonb not null default '[]'`, see
// 20260531_01_orders.sql:29) and downstream readers (mapOrder, the mobile
// order screen, admin actions) already iterate events looking for known
// `kind` markers.
//
// Buyer notification : "Commande expédiée" with the tracking number tucked
// into the body when present, deeplink `/order/<id>` (the buyer's order
// detail screen, which already renders the events list).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached } from '@shared/push.ts';
import { mapOrder, type OrderRow } from '@shared/catalog.ts';

interface Body {
  order_id: string;
  tracking_number?: string;
  // Free-text label of the carrier the seller picked (jefa / sopex / self /
  // pickup in the V1 UI). Stored verbatim on the event ; tolerant of future
  // additions without a schema change.
  carrier?: string;
}

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (!isUuid(x.order_id)) return false;
  if (x.tracking_number !== undefined) {
    if (typeof x.tracking_number !== 'string') return false;
    const t = x.tracking_number.trim();
    if (t.length === 0 || t.length > 60) return false;
  }
  if (x.carrier !== undefined) {
    if (typeof x.carrier !== 'string') return false;
    if (x.carrier.length === 0 || x.carrier.length > 32) return false;
  }
  return true;
}

Deno.serve(makePost<Body>('/v1/orders/set-tracking', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // 1. Load the order for owner + status check. Read events too so we can
  // append in the UPDATE without a separate round-trip.
  const { data: row, error: loadErr } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events, release_at, created_at')
    .eq('id', body.order_id)
    .maybeSingle();
  if (loadErr) {
    console.error('[set-order-tracking] load error:', loadErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!row) throwApi('ORDER_NOT_FOUND', 404, 'Commande introuvable.');

  const order = row as OrderRow;
  if (order.seller_id !== userId) {
    throwApi('FORBIDDEN', 403, "Cette commande ne fait pas partie de tes ventes.");
  }
  if (order.status !== 'paid') {
    // 'placed' = wallet flow pre-paid (unreachable for a manual ship), or rail
    // intent still pending. 'preparing' = already shipped. 'delivered' /
    // 'released' / 'disputed' / 'cancelled' / 'refunded' = beyond shipping.
    throwApi(
      'INVALID_STATUS',
      400,
      order.status === 'preparing'
        ? "Cette commande est déjà marquée comme expédiée."
        : "Cette commande n'est pas prête à être expédiée.",
    );
  }

  const trackingTrimmed = body.tracking_number?.trim();
  const carrierTrimmed = body.carrier?.trim();
  const nowIso = new Date().toISOString();

  const shipEvent: Record<string, unknown> = {
    at: nowIso,
    kind: 'shipped',
    label: 'Commande expédiée',
  };
  if (trackingTrimmed) shipEvent.tracking = trackingTrimmed;
  if (carrierTrimmed) shipEvent.carrier = carrierTrimmed;

  // 2. Atomic transition under the (status='paid') guard. A concurrent
  // confirm-receipt that already flipped the order to 'released' (or anything
  // not 'paid') will see 0 rows updated here and we'll return a clean 409.
  const { data: updated, error: upErr } = await sb
    .from('orders')
    .update({
      status: 'preparing',
      events: [...(order.events ?? []), shipEvent],
      updated_at: nowIso,
    })
    .eq('id', body.order_id)
    .eq('status', 'paid')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events, release_at, created_at')
    .maybeSingle();

  if (upErr) {
    console.error('[set-order-tracking] update error:', upErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur mise à jour commande');
  }
  if (!updated) {
    throwApi('INVALID_STATUS', 409, "Cette commande vient d'être mise à jour.");
  }

  const updatedRow = updated as OrderRow;

  // 3. Notify the buyer. Include the tracking number in the body when set so
  // the push itself is useful without opening the app ; the deeplink still
  // routes into the order detail for the full event log.
  const bodyText = trackingTrimmed
    ? `Ton colis est en route. Numéro de suivi : ${trackingTrimmed}.`
    : 'Ton colis est en route.';
  notifyDetached(sb, {
    userIds: [updatedRow.buyer_id],
    category: 'order',
    title: 'Commande expédiée',
    body: bodyText,
    iconHint: 'check',
    deeplink: `/order/${updatedRow.id}`,
    refType: 'order',
    refId: updatedRow.id,
  });

  return { body: { order: mapOrder(updatedRow) } };
}));
