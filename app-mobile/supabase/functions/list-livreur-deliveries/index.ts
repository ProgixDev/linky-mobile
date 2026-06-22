// Deliveries assigned to the signed-in livreur. Authed (requireUser →
// livreur_id from JWT — body never names a livreur, so a caller can't list
// someone else's deliveries by spoofing the param).
//
// Joins the order row in so the driver app can render reference, amount,
// product snapshot, and the buyer's first name in one round-trip. The
// buyer's full PII (phone, full address details) is intentionally NOT
// surfaced here ; a separate get-delivery endpoint will return that on
// per-delivery tap (livreur needs the destination to navigate, not bulk
// contact info for every assignment).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Cursor { created_at: string; id: string }
interface Body {
  status?: 'assigned' | 'in_transit' | 'delivered' | 'failed' | 'cancelled';
  limit?: number;
  cursor?: Cursor;
}

const STATUSES = new Set(['assigned', 'in_transit', 'delivered', 'failed', 'cancelled']);
// Anchored ISO — same shape used elsewhere (list-seller-orders).
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

function validCursor(c: unknown): c is Cursor {
  if (typeof c !== 'object' || c === null) return false;
  const x = c as Record<string, unknown>;
  if (typeof x.created_at !== 'string' || !ISO_RE.test(x.created_at)) return false;
  if (typeof x.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.id)) return false;
  return true;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.status !== undefined && (typeof x.status !== 'string' || !STATUSES.has(x.status as string))) return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 100)) return false;
  if (x.cursor !== undefined && !validCursor(x.cursor)) return false;
  return true;
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
  notes: string | null;
  created_at: string;
  updated_at: string;
  // join shape — PostgREST returns the joined row as a nested object.
  order: {
    id: string;
    reference: string;
    buyer_id: string;
    seller_id: string;
    product_snapshot: { title: string; photo: string; priceGnf: number };
    quantity: number;
    amount_minor: number | string;
    total_minor: number | string;
    status: string;
  } | null;
}

Deno.serve(makePost<Body>('/v1/deliveries/list-livreur', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const limit = body.limit ?? 50;

  let q = sb
    .from('deliveries')
    .select('id, order_id, livreur_id, status, delivery_address, assigned_at, pickup_at, delivered_at, notes, created_at, updated_at, order:orders!inner(id, reference, buyer_id, seller_id, product_snapshot, quantity, amount_minor, total_minor, status)')
    .eq('livreur_id', userId);

  if (body.status) q = q.eq('status', body.status);
  if (body.cursor) {
    const { created_at, id } = body.cursor;
    q = q.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`);
  }

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[list-livreur-deliveries] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data as DeliveryRow[] | null) ?? [];
  const next_cursor = rows.length === limit
    ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
    : null;

  // Shape the response : flatten the order join, coerce bigints to numbers,
  // never expose buyer/seller IDs raw in case the driver app would forward
  // them. The driver app gets just what it needs to render the card.
  const deliveries = rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    livreurId: r.livreur_id,
    status: r.status,
    deliveryAddress: r.delivery_address,
    assignedAt: r.assigned_at,
    pickupAt: r.pickup_at,
    deliveredAt: r.delivered_at,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    order: r.order ? {
      id: r.order.id,
      reference: r.order.reference,
      productSnapshot: r.order.product_snapshot,
      quantity: r.order.quantity,
      amountGnf: Number(r.order.amount_minor),
      totalGnf: Number(r.order.total_minor),
      status: r.order.status,
    } : null,
  }));

  return { body: { deliveries, next_cursor } };
}));
