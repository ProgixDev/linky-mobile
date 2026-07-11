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
import { stripeClient } from '@shared/stripe.ts';
import { getPaymentStatus } from '@shared/lengopay.ts';

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
    .select('id, rail, rail_intent_id')
    .eq('order_id', body.order_id)
    .eq('status', 'pending')
    .order('attempt_index', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!intent) throwApi('NO_PENDING_INTENT', 400, 'Aucun paiement en attente.');

  // Phase Q : stripe intents must ALSO be cancelled on Stripe's side BEFORE
  // the local cancel — otherwise a stale payment sheet could still charge the
  // card for an order we just cancelled. Lengopay has no cancel API ; its
  // intents expire via the cron TTL instead.
  if (intent.rail === 'stripe' && !intent.rail_intent_id.startsWith('pending-init-')) {
    try {
      await stripeClient().paymentIntents.cancel(intent.rail_intent_id);
    } catch (e) {
      // Cancel can race the payment. Re-read the PI : succeeded → the webhook
      // is about to flip the order to paid, so refuse the local cancel ;
      // already canceled → fine, proceed ; anything else → surface the error.
      let piStatus: string | undefined;
      try {
        piStatus = (await stripeClient().paymentIntents.retrieve(intent.rail_intent_id)).status;
      } catch { /* keep undefined — handled below */ }
      if (piStatus === 'succeeded') {
        throwApi('PAYMENT_ALREADY_COMPLETED', 409, "Le paiement vient d'aboutir — ta commande est confirmée.");
      }
      if (piStatus !== 'canceled') {
        console.error('[cancel-pending-payment] stripe PI cancel failed:', e);
        throwApi('RAIL_CANCEL_FAILED', 502, "Échec de l'annulation du paiement — réessaie.");
      }
    }
  }

  // Lengopay has no cancel API, but a buyer can pay on the hosted page and
  // THEN tap Annuler/Modifier before the cron poll flips the order — cancelling
  // a paid order = money taken, escrow never credited (review 2026-07-07).
  // Mirror the Stripe guard: check the rail status first ; if the payment
  // already succeeded, refuse the cancel so polling can settle it to paid.
  if (intent.rail === 'lengopay' && !intent.rail_intent_id.startsWith('pending-init-')) {
    let railStatus: string | undefined;
    try {
      railStatus = (await getPaymentStatus(intent.rail_intent_id)).status;
    } catch (e) {
      // Don't block cancel on a rail hiccup — the 15-min TTL sweep is the
      // backstop for a genuinely paid intent. Only swallow the fetch failure.
      console.error('[cancel-pending-payment] lengopay status check failed (proceeding):', e);
    }
    // Throw OUTSIDE the try so the refusal isn't caught by the fetch handler.
    if (railStatus === 'success') {
      throwApi('PAYMENT_ALREADY_COMPLETED', 409, "Le paiement vient d'aboutir — ta commande est confirmée.");
    }
  }

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
