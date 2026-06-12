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
// Phase V.5 — refund / dispute events :
//   charge.refunded               → log CRITICAL + ack 200. NO auto-ledger
//                                   action. A Stripe-dashboard refund while
//                                   the ledger says escrowed is exactly the
//                                   case humans must arbitrate ; auto-touching
//                                   the ledger from a webhook would couple a
//                                   support action to a settlement decision
//                                   without an admin in the loop.
//   charge.dispute.{created,
//     funds_withdrawn, closed,
//     funds_reinstated}           → same posture : log CRITICAL + ack. A
//                                   chargeback opened from Stripe doesn't move
//                                   the buyer / seller / escrow wallets ; the
//                                   admin reads the alert, weighs the evidence,
//                                   triggers resolve_dispute (or whatever V1.1
//                                   surfaces) with full audit context.
//
// This handler is the HARD PRECONDITION for the future sk_live swap : a live
// refund or chargeback dropped on the floor in test mode is annoying ; in live
// mode it's an open ledger lie ("balance says escrowed, Stripe says clawed").
// The acked + logged + flagged-for-human-review posture matches the existing
// CRITICAL log on the succeeded/non-pending and amount-mismatch branches.
//
// Idempotency : process_intent_outcome row-locks the intent and no-ops when it
// is already terminal (verified in 20260601_01) — duplicate or out-of-order
// deliveries can't double-credit. The status pre-check below just short-cuts
// the common duplicate case.
//
// Responses : 200 on processed / already-terminal / unknown-PI / unhandled
// event / refund / dispute (so Stripe doesn't retry forever) ; 401 on bad
// signature ; 500 on DB failure so Stripe DOES retry instead of dropping the
// outcome.

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

// Phase V.5 — refund + dispute events fan out to the alerting branch below.
const ALERT_ONLY = new Set([
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
  'charge.dispute.updated',
  'charge.dispute.closed',
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
    // Distinguish "we can't verify ANYTHING" (secret unset — config problem,
    // every order will stall) from an actual bad signature (probe / wrong env).
    if (e instanceof Error && e.message === 'stripe_webhook_secret_unset') {
      console.error('[stripe-webhook] LINKY_STRIPE_WEBHOOK_SECRET unset — all deliveries rejected until set');
    } else {
      console.error('[stripe-webhook] signature verification failed:', e);
    }
    return json({ error: 'invalid_signature' }, 401);
  }

  // Env cross-check : a live event hitting a test-keyed deployment (or vice
  // versa) is misrouted traffic — ack + ignore, never process.
  const expectLive = (Deno.env.get('LINKY_STRIPE_SECRET_KEY') ?? '').startsWith('sk_live_');
  if (event.livemode !== expectLive) {
    console.error('[stripe-webhook] livemode mismatch — event ignored', {
      event_livemode: event.livemode, expect_live: expectLive, event_type: event.type,
    });
    return json({ received: true, ignored: true }, 200);
  }

  // Phase V.5 — refund + dispute alerting. NO ledger action ; the structured
  // log line is what wakes a human up. We try to attach the local intent +
  // order id when the event references a recognizable PI / charge so the
  // human has the immediate context, but a missed lookup must NOT block the
  // ack (the alert is the load-bearing piece).
  if (ALERT_ONLY.has(event.type)) {
    const obj = event.data.object as { id?: string; payment_intent?: string; charge?: string; amount?: number; reason?: string; status?: string };
    const piIdGuess = (obj.payment_intent as string | undefined) ?? null;
    let alertCtx: Record<string, unknown> = {
      event_id: event.id,
      event_type: event.type,
      stripe_obj_id: obj.id ?? null,
      stripe_pi: piIdGuess,
      stripe_charge: obj.charge ?? null,
      stripe_amount: obj.amount ?? null,
      stripe_reason: obj.reason ?? null,
      stripe_status: obj.status ?? null,
    };
    if (piIdGuess) {
      const sbAlert = serviceClient();
      const { data: intent } = await sbAlert
        .from('payment_intents')
        .select('id, order_id, status, amount_minor, currency')
        .eq('rail', 'stripe').eq('rail_intent_id', piIdGuess).maybeSingle();
      if (intent) {
        alertCtx = { ...alertCtx, linky_intent_id: intent.id, linky_order_id: intent.order_id, linky_intent_status: intent.status, linky_amount_minor: intent.amount_minor };
      }
    }
    console.error('[stripe-webhook] CRITICAL refund/dispute event — human review required, NO ledger action taken', alertCtx);
    return json({ received: true, alerted: true }, 200);
  }

  if (!HANDLED.has(event.type)) {
    return json({ received: true, ignored: true }, 200);
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  const sb = serviceClient();

  const { data: intent, error: lookupErr } = await sb
    .from('payment_intents')
    .select('id, status, amount_minor')
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
  // Settlement integrity : the PI Stripe settled must match what we asked
  // for. A mismatch (tampered amount, wrong currency, reused PI id across
  // envs) must NOT credit escrow — leave the intent pending for manual
  // reconcile and ack so Stripe stops retrying.
  if (pi.amount !== Number(intent.amount_minor) || pi.currency !== 'gnf') {
    console.error('[stripe-webhook] CRITICAL amount/currency mismatch — intent left pending for manual reconcile', {
      intent_id: intent.id, stripe_pi: pi.id, event_type: event.type,
      pi_amount: pi.amount, pi_currency: pi.currency, intent_amount_minor: intent.amount_minor,
    });
    return json({ received: true, mismatch: true }, 200);
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
