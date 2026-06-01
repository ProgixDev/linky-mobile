// Cancel the latest pending payment intent on an order. Caller must be the
// buyer + order must be at status='placed' (no escrow movement yet). Used by
// the Modifier override flow when buyer wants to retry with a different phone,
// and by the Annuler button on the confirmation screen.
//
// Atomically: process_intent_outcome(cancelled) flips intent + order in one
// transaction. Same RPC the cron worker uses for terminal transitions.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { order_id: string }

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.order_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.order_id);
}

Deno.serve(makePost<Body>('/v1/payments/cancel-pending', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: order } = await sb.from('orders')
    .select('id, buyer_id, status').eq('id', body.order_id).maybeSingle();
  if (!order) throwApi('ORDER_NOT_FOUND', 404, 'Commande introuvable.');
  if (order.buyer_id !== userId) throwApi('FORBIDDEN', 403, "Tu n'es pas l'acheteur de cette commande.");
  if (order.status !== 'placed') throwApi('INVALID_STATUS', 400, 'Cette commande ne peut plus être annulée.');

  const { data: intent } = await sb
    .from('payment_intents')
    .select('id')
    .eq('order_id', body.order_id)
    .eq('status', 'pending')
    .order('attempt_index', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!intent) throwApi('NO_PENDING_INTENT', 400, 'Aucun paiement en attente.');

  const { error: rpcErr } = await sb.rpc('process_intent_outcome', {
    p_intent_id:       intent.id,
    p_terminal_status: 'cancelled',
    p_rail_status:     'user_cancelled',
    p_error_code:      'USER_CANCELLED',
    p_error_message:   'User initiated cancel/retry from confirmation screen',
  });
  if (rpcErr) {
    console.error('[cancel-pending-payment] rpc error:', rpcErr);
    throwApi('INTERNAL_ERROR', 500, "Erreur lors de l'annulation");
  }

  return { body: { ok: true } };
}));
