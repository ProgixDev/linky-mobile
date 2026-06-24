// Phase LIVREUR ASSIGNMENT — admin delivery board. Admin-only
// (requireUser + assertAdmin).
//
// Body : { status?: 'unassigned'|'assigned'|'in_transit'|'delivered'|'failed'|
//          'cancelled', limit?, cursor? }  (default 'unassigned').
// Response : { deliveries: [{ id, orderId, status, deliveryAddress,
//          assignedLivreur?: { id, name }, order: { reference, productSnapshot,
//          amountGnf, buyerCity }, createdAt }], next_cursor }
//
// The order is inner-joined (every delivery has one). The buyer's city and the
// assigned livreur's name come from a batch users lookup (avoids fragile
// nested embeds), same approach as admin-list-livreur-applications.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

const STATUSES = new Set(['unassigned', 'assigned', 'in_transit', 'delivered', 'failed', 'cancelled']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

interface Cursor { created_at: string; id: string }
interface Body {
  status?: 'unassigned' | 'assigned' | 'in_transit' | 'delivered' | 'failed' | 'cancelled';
  limit?: number;
  cursor?: Cursor;
}

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
  created_at: string;
  order: {
    reference: string;
    product_snapshot: { title: string; photo: string; priceGnf: number } | null;
    amount_minor: number | string;
    buyer_id: string;
  } | null;
}

Deno.serve(makePost<Body>('/v1/admin/deliveries/list', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const status = body.status ?? 'unassigned';
  const limit = body.limit ?? 50;

  let q = sb
    .from('deliveries')
    .select('id, order_id, livreur_id, status, delivery_address, created_at, order:orders!inner(reference, product_snapshot, amount_minor, buyer_id)')
    .eq('status', status);

  if (body.cursor) {
    const { created_at, id } = body.cursor;
    q = q.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`);
  }

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[admin-list-deliveries] select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data as DeliveryRow[] | null) ?? [];

  // Batch-load buyer cities + assigned-livreur names in one users query.
  const buyerIds = rows.map((r) => r.order?.buyer_id).filter((v): v is string => !!v);
  const livreurIds = rows.map((r) => r.livreur_id).filter((v): v is string => !!v);
  const ids = [...new Set([...buyerIds, ...livreurIds])];
  const cityByUser = new Map<string, string | null>();
  const nameByUser = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: users } = await sb.from('users').select('id, display_name, city').in('id', ids);
    for (const u of (users as { id: string; display_name: string | null; city: string | null }[] | null) ?? []) {
      cityByUser.set(u.id, u.city);
      nameByUser.set(u.id, u.display_name);
    }
  }

  const deliveries = rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    status: r.status,
    deliveryAddress: r.delivery_address,
    assignedLivreur: r.livreur_id
      ? { id: r.livreur_id, name: nameByUser.get(r.livreur_id) ?? null }
      : null,
    order: r.order
      ? {
          reference: r.order.reference,
          productSnapshot: r.order.product_snapshot,
          amountGnf: Number(r.order.amount_minor),
          buyerCity: cityByUser.get(r.order.buyer_id) ?? null,
        }
      : null,
    createdAt: r.created_at,
  }));

  const next_cursor = rows.length === limit
    ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
    : null;

  return { body: { deliveries, next_cursor } };
}));
