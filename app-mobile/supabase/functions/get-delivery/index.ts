// get-delivery — full detail for ONE delivery the signed-in livreur is assigned to.
// Authed (requireUser → livreur_id from the JWT; body never names a livreur). Unlike
// list-livreur-deliveries this DOES surface the buyer's display_name and the FULL
// delivery_address (street details), because the assigned driver needs the exact
// destination + a name at the door (spec 002 AC-1). A driver can only read a delivery
// they are assigned to: the row is scoped to delivery.livreur_id = caller, so a
// non-assigned or unknown id returns DELIVERY_NOT_FOUND (no existence/ownership leak,
// AC-9). The order's scan_token is deliberately NOT returned — the driver obtains it
// by scanning the buyer's QR, never from this endpoint.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  delivery_id: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.delivery_id === 'string' && UUID_RE.test(x.delivery_id);
}

interface DeliveryRow {
  id: string;
  order_id: string;
  livreur_id: string | null;
  status: string;
  delivery_address: Record<string, unknown> | null;
  assigned_at: string | null;
  pickup_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderRow {
  id: string;
  reference: string;
  buyer_id: string;
  product_snapshot: { title: string; photo: string; priceGnf: number } | null;
  amount_minor: number | string;
  total_minor: number | string;
  status: string;
}

Deno.serve(
  makePost<Body>('/v1/deliveries/get', valid, async ({ sb, body, req }) => {
    const userId = await requireUser(req);

    // 1. The delivery — scoped to the caller. Not-found OR not-assigned-to-you both
    //    return 404 so the endpoint never reveals another driver's assignments.
    const { data: deliveryData, error: dErr } = await sb
      .from('deliveries')
      .select(
        'id, order_id, livreur_id, status, delivery_address, assigned_at, pickup_at, delivered_at, created_at, updated_at',
      )
      .eq('id', body.delivery_id)
      .eq('livreur_id', userId)
      .maybeSingle();
    if (dErr) {
      console.error('[get-delivery] delivery query error:', dErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    if (!deliveryData) throwApi('DELIVERY_NOT_FOUND', 404, 'Livraison introuvable.');
    const delivery = deliveryData as DeliveryRow;

    // 2. The order — reference, amount, product snapshot, status.
    const { data: orderData, error: oErr } = await sb
      .from('orders')
      .select('id, reference, buyer_id, product_snapshot, amount_minor, total_minor, status')
      .eq('id', delivery.order_id)
      .single();
    if (oErr || !orderData) {
      console.error('[get-delivery] order readback error:', oErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
    }
    const order = orderData as OrderRow;

    // 3. Buyer display name (nullable → client falls back to "Customer"). No phone or
    //    other PII: the order carries no verified buyer phone (spec 002 — out of scope).
    const { data: buyer } = await sb
      .from('users')
      .select('display_name')
      .eq('id', order.buyer_id)
      .maybeSingle();

    const addr = (delivery.delivery_address ?? {}) as Record<string, unknown>;

    return {
      body: {
        id: delivery.id,
        orderId: delivery.order_id,
        status: delivery.status,
        createdAt: delivery.created_at,
        // FULL address (incl. the street `details` the list omits) — only ever
        // returned for the driver's own assigned delivery.
        deliveryAddress: {
          city: (addr.city as string | null) ?? null,
          district: (addr.district as string | null) ?? null,
          details: (addr.details as string | null) ?? null,
        },
        order: {
          id: order.id,
          reference: order.reference,
          productSnapshot: order.product_snapshot,
          amountGnf: Number(order.amount_minor),
          totalGnf: Number(order.total_minor),
          status: order.status,
        },
        buyer: { displayName: (buyer?.display_name as string | null) ?? null },
      },
    };
  }),
);
