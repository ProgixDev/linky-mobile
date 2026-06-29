// Buyer rates the shop after a completed order. Authed (requireUser → reviewer).
// Guards: caller is the order's buyer, the order is completed (released/delivered),
// not already reviewed (unique order_id+reviewer_id). On insert, recomputes the shop's
// denormalized rating + review_count from all its reviews.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  order_id: string;
  rating: number;
  comment?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const COMPLETED = new Set(['released', 'delivered']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.order_id !== 'string' || !UUID_RE.test(x.order_id)) return false;
  if (typeof x.rating !== 'number' || !Number.isInteger(x.rating) || x.rating < 1 || x.rating > 5) {
    return false;
  }
  if (x.comment !== undefined && (typeof x.comment !== 'string' || x.comment.length > 1000)) {
    return false;
  }
  return true;
}

Deno.serve(makePost<Body>('/v1/reviews/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: orderRow, error: oErr } = await sb
    .from('orders')
    .select('id, buyer_id, seller_id, shop_id, status')
    .eq('id', body.order_id)
    .maybeSingle();
  if (oErr) {
    console.error('[create-review] order query error:', oErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!orderRow) throwApi('ORDER_NOT_FOUND', 404, 'Commande introuvable.');
  const order = orderRow as {
    buyer_id: string;
    seller_id: string;
    shop_id: string;
    status: string;
  };
  if (order.buyer_id !== userId) {
    throwApi('FORBIDDEN', 403, "Seul l'acheteur de cette commande peut la noter.");
  }
  if (!COMPLETED.has(order.status)) {
    throwApi('ORDER_NOT_COMPLETED', 409, 'Tu pourras noter une fois la commande livrée.');
  }

  const comment = body.comment?.trim() || null;
  const { error: iErr } = await sb.from('reviews').insert({
    order_id: body.order_id,
    reviewer_id: userId,
    shop_id: order.shop_id,
    seller_id: order.seller_id,
    rating: body.rating,
    comment,
  });
  if (iErr) {
    if ((iErr as { code?: string }).code === '23505') {
      throwApi('ALREADY_REVIEWED', 409, 'Tu as déjà noté cette commande.');
    }
    console.error('[create-review] insert error:', iErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  // Recompute the shop's denormalized rating + count from all its reviews.
  const { data: rows } = await sb.from('reviews').select('rating').eq('shop_id', order.shop_id);
  const ratings = ((rows as { rating: number }[] | null) ?? []).map((r) => r.rating);
  const count = ratings.length;
  const avg = count ? Math.round((ratings.reduce((a, b) => a + b, 0) / count) * 10) / 10 : 0;
  await sb.from('shops').update({ rating: avg, review_count: count }).eq('id', order.shop_id);

  return { body: { ok: true, rating: avg, reviewCount: count } };
}));
