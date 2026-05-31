// Get a single order. Authed; caller must be buyer OR seller (no public order
// pages — orders are private to participants).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapOrder, type OrderRow } from '@shared/catalog.ts';

interface Body { id: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.id === 'string' && /^[0-9a-f-]{36}$/i.test(x.id);
}

Deno.serve(makePost<Body>('/v1/orders/get', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const { data: row, error } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, status, events, release_at, created_at')
    .eq('id', body.id)
    .maybeSingle();
  if (error) {
    console.error('[get-order] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!row) throwApi('ORDER_NOT_FOUND', 404, 'Commande introuvable.');
  const r = row as OrderRow;
  if (r.buyer_id !== userId && r.seller_id !== userId) {
    throwApi('FORBIDDEN', 403, 'Action refusée.');
  }
  return { body: { order: mapOrder(r) } };
}));
