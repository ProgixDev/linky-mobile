// Buyer confirms reception of an order. Authed (requireUser → caller_id).
// Requires a scan_token (the secret printed inside the seller's QR) — the
// confirm_order_receipt RPC verifies caller=buyer + status in (paid, delivered)
// + scan_token matches the row's stored token, then atomically splits the
// escrow: amount → seller wallet, fees → platform wallet. Order moves to
// status='released' with 'Réception confirmée' appended to events. Returns
// the updated order row.
//
// Without scan_token (or with a wrong one), the RPC raises INVALID_SCAN_TOKEN
// and the edge fn surfaces a 400 with a French message inviting the buyer to
// scan the QR on the package.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapOrder, type OrderRow } from '@shared/catalog.ts';

interface Body {
  order_id: string;
  scan_token: string;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.order_id)) return false;
  if (typeof x.scan_token !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.scan_token)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/orders/confirm-receipt', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { error: rpcErr } = await sb.rpc('confirm_order_receipt', {
    p_order_id: body.order_id,
    p_caller_id: userId,
    p_scan_token: body.scan_token,
  });
  if (rpcErr) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    console.error('[confirm-receipt] rpc error:', rpcErr);
    if (msg.includes('ORDER_NOT_FOUND'))     throwApi('ORDER_NOT_FOUND',     404, 'Commande introuvable.');
    if (msg.includes('ORDER_NOT_BUYER'))     throwApi('FORBIDDEN',           403, "Tu n'es pas l'acheteur de cette commande.");
    if (msg.includes('INVALID_STATUS'))      throwApi('INVALID_STATUS',      400, 'État de commande invalide pour cette action.');
    if (msg.includes('INVALID_SCAN_TOKEN'))  throwApi('INVALID_SCAN_TOKEN',  400, 'Code de réception invalide. Scanne le QR sur le colis pour confirmer.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur confirmation réception');
  }

  const { data: row, error: readErr } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, status, events, release_at, created_at')
    .eq('id', body.order_id)
    .single();
  if (readErr || !row) {
    console.error('[confirm-receipt] readback error:', readErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
  }
  return { body: { order: mapOrder(row as OrderRow) } };
}));
