// Place an order. Authed (requireUser → buyer_id). Calls place_order RPC which
// validates the product, computes totals, and inserts an order row in 'placed'
// state. H1 does NOT touch wallets — the full escrow lifecycle (debit on
// place, release on confirm-receipt, dispute paths, platform fees) lands in H2
// with fresh eyes.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapOrder, type OrderRow } from '@shared/catalog.ts';

interface Body {
  product_id: string;
  quantity: number;
  payment_method: 'orange-money' | 'mtn-money' | 'card' | 'wallet';
}

const METHODS = new Set(['orange-money', 'mtn-money', 'card', 'wallet']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.product_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.product_id)) return false;
  if (typeof x.quantity !== 'number' || !Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > 100) return false;
  if (typeof x.payment_method !== 'string' || !METHODS.has(x.payment_method)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/orders/place', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: newId, error: rpcErr } = await sb.rpc('place_order', {
    p_buyer_id: userId,
    p_product_id: body.product_id,
    p_quantity: body.quantity,
    p_payment_method: body.payment_method,
  });
  if (rpcErr || !newId) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    console.error('[place-order] rpc error:', rpcErr);
    if (msg.includes('PRODUCT_NOT_FOUND'))            throwApi('PRODUCT_NOT_FOUND', 404, 'Produit introuvable.');
    if (msg.includes('PRODUCT_NOT_AVAILABLE'))        throwApi('PRODUCT_NOT_AVAILABLE', 400, 'Produit indisponible.');
    if (msg.includes('BUYER_IS_SELLER'))              throwApi('BUYER_IS_SELLER', 400, "Tu ne peux pas acheter ton propre produit.");
    if (msg.includes('INVALID_QUANTITY'))             throwApi('INVALID_BODY', 400, 'Quantité invalide.');
    if (msg.includes('PAYMENT_METHOD_NOT_SUPPORTED')) throwApi('PAYMENT_METHOD_NOT_SUPPORTED', 400, 'Méthode de paiement non supportée. Utilise le portefeuille.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur création commande');
  }

  const { data: row, error: readErr } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, status, events, release_at, created_at')
    .eq('id', newId)
    .single();
  if (readErr || !row) {
    console.error('[place-order] readback error:', readErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
  }
  return { body: { order: mapOrder(row as OrderRow) } };
}));
