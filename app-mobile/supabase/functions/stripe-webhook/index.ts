// Phase Q — Stripe webhook (public endpoint, signature-gated). Pattern
// follows didit-webhook : no makePost, no bearer, no idempotency-key header ;
// gate is the stripe-signature HMAC over the RAW body. Deploy --no-verify-jwt.
//
// Event handling :
//   payment_intent.succeeded      → process_intent_outcome('completed')
//                                   → order paid, escrow credited, seller push.
//   payment_intent.canceled       → process_intent_outcome('cancelled')
//                                   → order cancelled (PI is truly dead).
//   payment_intent.payment_failed → NOT terminal. Inside the payment sheet a
//                                   declined card goes back to
//                                   requires_payment_method and the buyer can
//                                   retry with the SAME PaymentIntent. Marking
//                                   the intent failed here would cancel the
//                                   order while a later retry can still charge
//                                   the card → money-taken / order-cancelled
//                                   mismatch. We only record the attempt via
//                                   bump_intent_poll and keep the intent
//                                   pending.
//
// Idempotency : process_intent_outcome row-locks the intent and no-ops when it
// is already terminal (verified in 20260601_01) — duplicate or out-of-order
// deliveries can't double-credit. The status pre-check below just short-cuts
// the common duplicate case.
//
// Responses : 200 on processed / already-terminal / unknown-PI / unhandled
// event (so Stripe doesn't retry forever) ; 401 on bad signature ; 500 on DB
// failure so Stripe DOES retry instead of dropping the outcome.

import type Stripe from 'stripe';
import { serviceClient } from '@shared/db.ts';
import { constructWebhookEvent } from '@shared/stripe.ts';
import { notifyOrderPaid } from '@shared/order-paid-push.ts';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

const HANDLED = new Set([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
]);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) return json({ error: 'missing_signature' }, 401);

  let event: Stripe.Event;
  try {
    event = await constructWebhookEvent(rawBody, signature);
  } catch (e) {
    console.error('[stripe-webhook] signature verification failed:', e);
    return json({ error: 'invalid_signature' }, 401);
  }

  if (!HANDLED.has(event.type)) {
    return json({ received: true, ignored: true }, 200);
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  const sb = serviceClient();

  const { data: intent, error: lookupErr } = await sb
    .from('payment_intents')
    .select('id, status')
    .eq('rail', 'stripe')
    .eq('rail_intent_id', pi.id)
    .maybeSingle();
  if (lookupErr) {
    console.error('[stripe-webhook] intent lookup failed:', lookupErr);
    return json({ error: 'lookup_failed' }, 500);
  }
  if (!intent) {
    // Unknown PI — cross-env test traffic or a dashboard-created intent.
    // Ack so Stripe stops retrying ; log for ops.
    console.error('[stripe-webhook] no payment_intents row for', pi.id, event.type);
    return json({ received: true, ignored: true }, 200);
  }
  if (intent.status !== 'pending') {
    if (event.type === 'payment_intent.succeeded' && intent.status !== 'completed') {
      // Money landed on Stripe for an intent we already closed otherwise
      // (e.g. cancel raced the payment). Needs manual reconcile — log LOUD.
      console.error('[stripe-webhook] CRITICAL succeeded event for non-pending intent', {
        intent_id: intent.id, local_status: intent.status, stripe_pi: pi.id,
      });
    }
    return json({ received: true, already_terminal: true }, 200);
  }

  if (event.type === 'payment_intent.payment_failed') {
    const { error: bumpErr } = await sb.rpc('bump_intent_poll', {
      p_intent_id:     intent.id,
      p_rail_status:   pi.status,
      p_error_code:    pi.last_payment_error?.code ?? 'CARD_PAYMENT_FAILED',
      p_error_message: (pi.last_payment_error?.message ?? '').slice(0, 500) || null,
    });
    if (bumpErr) {
      console.error('[stripe-webhook] bump_intent_poll failed:', bumpErr);
      return json({ error: 'bump_failed' }, 500);
    }
    return json({ received: true, attempt_recorded: true }, 200);
  }

  const terminal = event.type === 'payment_intent.succeeded' ? 'completed' : 'cancelled';
  const { error: rpcErr } = await sb.rpc('process_intent_outcome', {
    p_intent_id:       intent.id,
    p_terminal_status: terminal,
    p_rail_status:     pi.status,
    p_error_code:      terminal === 'cancelled' ? 'STRIPE_CANCELED' : null,
    p_error_message:   terminal === 'cancelled' ? (pi.cancellation_reason ?? null) : null,
  });
  if (rpcErr) {
    console.error('[stripe-webhook] process_intent_outcome failed:', rpcErr);
    return json({ error: 'outcome_failed' }, 500);
  }

  if (terminal === 'completed') {
    await notifyOrderPaid(sb, intent.id);
  }
  return json({ received: true }, 200);
});
