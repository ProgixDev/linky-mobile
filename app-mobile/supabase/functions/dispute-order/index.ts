// Buyer disputes a paid/delivered order. Authed (requireUser → caller_id).
// Calls dispute_order RPC which verifies caller=buyer, status in (paid,
// delivered), and the reason value, then marks status='disputed' and appends
// a 'Litige ouvert' event with reason + optional note. No fund movement —
// funds stay in escrow until admin resolution (Phase K).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapOrder, type OrderRow } from '@shared/catalog.ts';

interface Body {
  order_id: string;
  reason: 'damaged' | 'wrong' | 'not_received';
  note?: string;
}

const REASONS = new Set(['damaged', 'wrong', 'not_received']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.order_id)) return false;
  if (typeof x.reason !== 'string' || !REASONS.has(x.reason)) return false;
  if (x.note !== undefined && (typeof x.note !== 'string' || x.note.length > 500)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/orders/dispute', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { error: rpcErr } = await sb.rpc('dispute_order', {
    p_order_id: body.order_id,
    p_caller_id: userId,
    p_reason: body.reason,
    p_note: body.note ?? '',
  });
  if (rpcErr) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    console.error('[dispute-order] rpc error:', rpcErr);
    if (msg.includes('ORDER_NOT_FOUND')) throwApi('ORDER_NOT_FOUND', 404, 'Commande introuvable.');
    if (msg.includes('ORDER_NOT_BUYER')) throwApi('FORBIDDEN',        403, "Tu n'es pas l'acheteur de cette commande.");
    if (msg.includes('INVALID_STATUS')) throwApi('INVALID_STATUS',    400, 'État de commande invalide pour cette action.');
    if (msg.includes('INVALID_REASON')) throwApi('INVALID_BODY',      400, 'Raison invalide.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur ouverture litige');
  }

  const { data: row, error: readErr } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, status, events, release_at, created_at')
    .eq('id', body.order_id)
    .single();
  if (readErr || !row) {
    console.error('[dispute-order] readback error:', readErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
  }
  return { body: { order: mapOrder(row as OrderRow) } };
}));
