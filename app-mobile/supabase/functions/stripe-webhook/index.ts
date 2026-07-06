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
import { notifyDetached } from '@shared/push.ts';

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

  // ── TOPUP branch ─────────────────────────────────────────────────────────
  // Card wallet funding (wallet-topup-card) tags the PI metadata.kind='topup'.
  // It has NO payment_intents row — it credits the wallet via confirm_topup
  // (idempotent, one-sided ledger credit) rather than the order settlement RPC.
  if (pi.metadata?.kind === 'topup') {
    const topupId = pi.metadata.topup_intent_id;
    if (!topupId) {
      console.error('[stripe-webhook] topup PI missing topup_intent_id', pi.id);
      return json({ received: true, ignored: true }, 200);
    }
    // Settlement integrity — mirrors the order rail's pi.amount check. confirm_topup
    // credits the RECORDED topup amount, so the amount Stripe actually settled MUST
    // equal what we recorded ; a divergence (tampered row, reused / cross-env PI,
    // any Stripe-side anomaly) must NOT credit. We look the row up here and refuse
    // on mismatch rather than trusting metadata alone.
    const { data: rec, error: recErr } = await sb
      .from('topup_intents')
      .select('amount_minor, currency, status')
      .eq('id', topupId)
      .maybeSingle();
    if (recErr) {
      console.error('[stripe-webhook] topup lookup failed:', recErr);
      return json({ error: 'topup_lookup_failed' }, 500);
    }
    if (!rec) {
      console.error('[stripe-webhook] no topup_intents row for', topupId, pi.id);
      return json({ received: true, ignored: true }, 200);
    }
    if (pi.amount !== Number(rec.amount_minor) || pi.currency !== 'gnf' || rec.currency !== 'GNF') {
      console.error('[stripe-webhook] CRITICAL topup amount/currency mismatch — NOT credited', {
        stripe_pi: pi.id, topup_id: topupId,
        pi_amount: pi.amount, pi_currency: pi.currency,
        rec_amount: rec.amount_minor, rec_currency: rec.currency,
      });
      return json({ received: true, mismatch: true }, 200);
    }
    // Only a successful charge credits the wallet. failed/canceled leaves the
    // topup_intent pending (no money moved) ; the user just starts a new one.
    if (event.type !== 'payment_intent.succeeded') {
      return json({ received: true, topup_noncomplete: true }, 200);
    }
    // Idempotent short-circuit before the RPC (confirm_topup's row lock is the
    // real guard against a concurrent double-credit).
    if (rec.status !== 'pending') {
      return json({ received: true, topup_already: true }, 200);
    }
    const { error: topErr } = await sb.rpc('confirm_topup', { p_topup_id: topupId });
    if (topErr) {
      const msg = topErr.message ?? '';
      // Idempotent : a duplicate / out-of-order delivery finds it already done.
      if (msg.includes('TOPUP_NOT_PENDING') || msg.includes('TOPUP_NOT_FOUND')) {
        return json({ received: true, topup_already: true }, 200);
      }
      console.error('[stripe-webhook] confirm_topup failed:', topErr);
      return json({ error: 'topup_failed' }, 500); // 500 → Stripe retries
    }
    return json({ received: true, topup_credited: true }, 200);
  }

  // ── BOOKING branch ───────────────────────────────────────────────────────
  // Rental booking payment (booking-sign-pay) tags metadata.kind='booking'.
  // Mirrors the topup branch : no payment_intents row — the money lands via
  // confirm_booking_payment (idempotent, one-sided escrow credit + status flip).
  if (pi.metadata?.kind === 'booking') {
    const bookingId = pi.metadata.booking_id;
    if (!bookingId) {
      console.error('[stripe-webhook] booking PI missing booking_id', pi.id);
      return json({ received: true, ignored: true }, 200);
    }
    const { data: bk, error: bkErr } = await sb
      .from('bookings')
      .select('total_minor, currency, status, landlord_id, tenant_id, property_snapshot')
      .eq('id', bookingId)
      .maybeSingle();
    if (bkErr) {
      console.error('[stripe-webhook] booking lookup failed:', bkErr);
      return json({ error: 'booking_lookup_failed' }, 500);
    }
    if (!bk) {
      console.error('[stripe-webhook] no bookings row for', bookingId, pi.id);
      return json({ received: true, ignored: true }, 200);
    }
    // Settlement integrity — the settled amount MUST equal the recorded total.
    if (pi.amount !== Number(bk.total_minor) || pi.currency !== 'gnf' || bk.currency !== 'GNF') {
      console.error('[stripe-webhook] CRITICAL booking amount/currency mismatch — NOT credited', {
        stripe_pi: pi.id, booking_id: bookingId,
        pi_amount: pi.amount, pi_currency: pi.currency,
        rec_total: bk.total_minor, rec_currency: bk.currency,
      });
      return json({ received: true, mismatch: true }, 200);
    }
    if (event.type !== 'payment_intent.succeeded') {
      return json({ received: true, booking_noncomplete: true }, 200);
    }
    if (bk.status !== 'accepted') {
      // A SUCCEEDED charge for a booking that is already past 'accepted' means
      // Stripe holds money we did not credit (double-PI edge case) — that
      // charge needs a manual refund. Scream, don't swallow.
      console.error('[stripe-webhook] CRITICAL booking charge on non-accepted booking — manual refund required', {
        stripe_pi: pi.id, booking_id: bookingId, booking_status: bk.status, amount: pi.amount,
      });
      return json({ received: true, booking_already: true }, 200);
    }
    const { data: outcome, error: cbErr } = await sb.rpc('confirm_booking_payment', { p_booking_id: bookingId });
    if (cbErr) {
      console.error('[stripe-webhook] confirm_booking_payment failed:', cbErr);
      return json({ error: 'booking_confirm_failed' }, 500); // 500 → Stripe retries
    }
    if (outcome === 'conflict') {
      // The dates were taken by another paid booking between accept and payment.
      // The charge WAS captured but NOT credited — manual refund required.
      console.error('[stripe-webhook] CRITICAL booking dates-conflict — charge captured, NOT credited, manual refund required', {
        stripe_pi: pi.id, booking_id: bookingId, amount: pi.amount,
      });
      return json({ received: true, booking_conflict: true }, 200);
    }
    if (outcome === 'confirmed') {
      const title = ((bk.property_snapshot as { title?: string } | null)?.title) ?? 'votre bien';
      notifyDetached(sb, {
        userIds: [bk.landlord_id as string],
        category: 'booking',
        title: 'Réservation payée',
        body: `Le contrat pour « ${title} » est signé — le loyer est sécurisé en séquestre.`,
        iconHint: 'check',
        deeplink: `/agent/leases/${bookingId}`,
        refType: 'booking',
        refId: bookingId,
        app: 'marketplace',
      });
    }
    return json({ received: true, booking: outcome }, 200);
  }

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
