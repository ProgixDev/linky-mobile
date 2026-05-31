// Caller's own orders as buyer. Cursor pagination on (created_at, id) desc to
// match list-products / list-properties. Optional status filter. Seller-side
// list (list-seller-orders) lands in a later H step.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapOrder, type OrderRow } from '@shared/catalog.ts';

interface Cursor { created_at: string; id: string }
interface Body { status?: string; limit?: number; cursor?: Cursor }

const STATUSES = new Set(['placed', 'paid', 'preparing', 'delivered', 'released', 'disputed']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

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

Deno.serve(makePost<Body>('/v1/orders/list-mine', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const limit = body.limit ?? 50;
  let q = sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, status, events, release_at, created_at')
    .eq('buyer_id', userId);
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
    console.error('[list-my-orders] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const rows = (data as OrderRow[] | null) ?? [];
  const next_cursor = rows.length === limit
    ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
    : null;
  return { body: { orders: rows.map(mapOrder), next_cursor } };
}));
