// THE INVERTED CONFIRM — driver app calls this when scanning the CLIENT's
// on-screen order QR at handoff. Authed (requireUser → caller_id = livreur).
// livreur_confirm_handoff RPC enforces : delivery exists, caller is the
// assigned livreur for it, status valid, scan_token matches. On success,
// releases escrow (escrow → seller for amount_minor, escrow → platform for
// fees_minor) AND flips deliveries.status='delivered' + orders.status='released'
// in one transaction.
//
// scan_token PII : we scrub it from any error/log payload the same way
// confirm-receipt does (V.3b). The wrap.ts idempotency cache does NOT
// strip the response here because the response carries no token — only
// the updated delivery row and a 'released' status snippet.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached, formatGNF } from '@shared/push.ts';

interface Body {
  order_id: string;
  scan_token: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.order_id !== 'string' || !UUID_RE.test(x.order_id)) return false;
  if (typeof x.scan_token !== 'string' || !UUID_RE.test(x.scan_token)) return false;
  return true;
}

function scrubUuids(s: string | undefined): string | undefined {
  if (!s) return s;
  return s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid-redacted>');
}

Deno.serve(makePost<Body>('/v1/deliveries/livreur-confirm-handoff', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { error: rpcErr } = await sb.rpc('livreur_confirm_handoff', {
    p_order_id:   body.order_id,
    p_livreur_id: userId,
    p_scan_token: body.scan_token,
  });
  if (rpcErr) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    const errShape = rpcErr as { code?: string; message?: string; details?: string; hint?: string };
    console.error('[livreur-confirm-handoff] rpc error:', {
      code:    errShape.code,
      message: scrubUuids(errShape.message),
      details: scrubUuids(errShape.details),
      hint:    scrubUuids(errShape.hint),
    });
    if (msg.includes('ORDER_NOT_FOUND'))         throwApi('ORDER_NOT_FOUND',         404, 'Commande introuvable.');
    if (msg.includes('DELIVERY_NOT_FOUND'))      throwApi('DELIVERY_NOT_FOUND',      404, 'Livraison introuvable.');
    if (msg.includes('NOT_ASSIGNED_LIVREUR'))    throwApi('NOT_ASSIGNED_LIVREUR',    403, "Tu n'es pas le livreur assigné à cette commande.");
    if (msg.includes('INVALID_STATUS'))          throwApi('INVALID_STATUS',          400, 'État de commande invalide pour cette action.');
    if (msg.includes('INVALID_DELIVERY_STATUS')) throwApi('INVALID_DELIVERY_STATUS', 400, 'Cette livraison ne peut pas être confirmée dans son état actuel.');
    if (msg.includes('INVALID_SCAN_TOKEN'))      throwApi('INVALID_SCAN_TOKEN',      400, "Le QR scanné ne correspond pas à cette commande.");
    throwApi('INTERNAL_ERROR', 500, 'Erreur confirmation de livraison');
  }

  const { data: delivery, error: dErr } = await sb
    .from('deliveries')
    .select('id, order_id, livreur_id, status, delivery_address, assigned_at, pickup_at, delivered_at, created_at, updated_at')
    .eq('order_id', body.order_id)
    .single();
  if (dErr || !delivery) {
    console.error('[livreur-confirm-handoff] delivery readback error:', dErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture livraison');
  }

  const { data: order, error: oErr } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, amount_minor, status')
    .eq('id', body.order_id)
    .single();
  if (oErr || !order) {
    console.error('[livreur-confirm-handoff] order readback error:', oErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
  }

  // Notify seller (funds released) and buyer (delivery confirmed). Mirrors
  // confirm-receipt's notification posture ; livreur gets the success state
  // inline in the response.
  notifyDetached(sb, {
    userIds: [order.seller_id as string],
    category: 'order',
    title: 'Livraison confirmée',
    body: `${formatGNF(Number(order.amount_minor))} ajoutés à ton portefeuille.`,
    iconHint: 'star',
    deeplink: `/seller/orders/${order.id}`,
    refType: 'order',
    refId: order.id as string,
  });
  notifyDetached(sb, {
    userIds: [order.buyer_id as string],
    category: 'order',
    title: 'Commande livrée',
    body: `Le livreur a confirmé la remise de ta commande #${order.reference}.`,
    iconHint: 'check',
    deeplink: `/order/${order.id}`,
    refType: 'order',
    refId: order.id as string,
  });

  return { body: { delivery, order_status: order.status } };
}));
