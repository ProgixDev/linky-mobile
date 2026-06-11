// Final sprint §2 — admin orders table (READ-ONLY ; disputes keep their own
// dedicated console). Body : { status?: OrderStatus } — omit for all.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

const STATUSES = new Set([
  'placed', 'paid', 'preparing', 'delivered', 'released', 'disputed', 'cancelled', 'refunded',
]);

interface Body {
  status?: string;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return x.status === undefined || (typeof x.status === 'string' && STATUSES.has(x.status));
}

const SELECT =
  'id, reference, total_minor, status, created_at, product_snapshot, ' +
  'buyer:users!orders_buyer_id_fkey(id, display_name), ' +
  'seller:users!orders_seller_id_fkey(id, display_name)';

Deno.serve(makePost<Body>('/v1/admin/orders/list', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  let q = sb.from('orders').select(SELECT).order('created_at', { ascending: false }).limit(100);
  if (body.status) q = q.eq('status', body.status);

  const { data, error } = await q;
  if (error) {
    console.error('[list-orders-admin] select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return { body: { orders: data ?? [] } };
}));
