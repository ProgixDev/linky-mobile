// Cron worker for payment_intents. Triggered every 5s via pg_cron →
// kick_payment_intents_poll() → net.http_post() → this function.
//
// S3: defended by x-cron-secret header. Compares LINKY_CRON_SECRET env var
// (injected at deploy time) to the header value the kick function includes.
// Without this, anyone with the public anon key could POST here.
//
// Tick body:
//   1. pick_intents_to_poll(200) — backoff-aware FOR UPDATE SKIP LOCKED
//   2. For each: getPaymentStatus(rail_intent_id)
//        success → process_intent_outcome(completed) atomic
//        failed/cancelled → process_intent_outcome(terminal) atomic
//        pending (clean) → bump_intent_poll(rail_status='pending', error=null)
//   3. On thrown error (network, 5xx, timeout): bump with
//      last_error_code='RAIL_TRANSIENT' so expire_stale_intents (S5) defers.
//   4. expire_stale_intents() — sweep > 15 min old (only if last poll was clean).
//
// Phase V.6 — stale Stripe PI sweep (Q-1 backlog) :
//   5. pick_stale_stripe_intents(50) — pending stripe intents older than 15
//      minutes whose rail_intent_id is a real Stripe PI (not the
//      pending-init- placeholder). For each :
//        a) Cancel the PI on Stripe FIRST via paymentIntents.cancel().
//           Order of operations IS the safety property — if we expired the
//           local intent before cancelling on Stripe, the buyer's stale
//           payment sheet could still charge the card and we'd have a
//           money-taken / order-cancelled mismatch.
//        b) If the cancel succeeds OR the PI was already 'canceled' (idempotent
//           on Stripe) → process_intent_outcome(cancelled) flips the local
//           intent + order atomically through the same RPC user-cancel uses.
//        c) If the PI is already 'succeeded' on Stripe → the webhook IS about
//           to flip the local intent to completed (or already did). Skip ;
//           the cron will not see this row again on the next tick.
//        d) On API error or unexpected status → leave the intent for the next
//           tick. We don't bump RAIL_TRANSIENT because stripe intents aren't
//           polled in step 1 anyway ; the next sweep will retry.

import { serviceClient } from '@shared/db.ts';
import { getPaymentStatus } from '@shared/lengopay.ts';
import { notifyOrderPaid } from '@shared/order-paid-push.ts';
import { stripeClient } from '@shared/stripe.ts';

interface PendingIntent {
  id: string;
  rail_intent_id: string;
  rail: string;
  attempts_count: number;
  status: string;
  rail_status: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // S3: shared-secret auth. The Supabase gateway already requires apikey for
  // routing — necessary but NOT sufficient (anon key is public). We additionally
  // require x-cron-secret to match LINKY_CRON_SECRET.
  const expectedSecret = Deno.env.get('LINKY_CRON_SECRET') ?? '';
  const providedSecret = req.headers.get('x-cron-secret') ?? '';
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }

  const sb = serviceClient();
  const { data: intents, error: pickErr } = await sb.rpc('pick_intents_to_poll', { p_limit: 200 });
  if (pickErr) {
    console.error('[cron-poll-intents] pick error:', pickErr);
    return new Response(JSON.stringify({ error: 'pick failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }

  let polled = 0, completed = 0, failed = 0, cancelled = 0, stillPending = 0, errors = 0;

  for (const intent of (intents ?? []) as PendingIntent[]) {
    polled++;
    try {
      const status = await getPaymentStatus(intent.rail_intent_id);

      if (status.status === 'success') {
        const { error: outcomeErr } = await sb.rpc('process_intent_outcome', {
          p_intent_id: intent.id,
          p_terminal_status: 'completed',
          p_rail_status: status.status,
          p_error_code: null,
          p_error_message: null,
        });
        // Throw into the loop's transient handler : a DB failure here means
        // the intent is NOT terminal — it must get the RAIL_TRANSIENT bump,
        // not a completed++ and a premature seller push.
        if (outcomeErr) throw new Error(`process_intent_outcome failed: ${outcomeErr.message}`);
        completed++;
        await notifyOrderPaid(sb, intent.id);
      } else if (status.status === 'failed') {
        await sb.rpc('process_intent_outcome', {
          p_intent_id: intent.id,
          p_terminal_status: 'failed',
          p_rail_status: status.status,
          p_error_code: status.error_code ?? null,
          p_error_message: status.message ?? null,
        });
        failed++;
      } else if (status.status === 'cancelled') {
        await sb.rpc('process_intent_outcome', {
          p_intent_id: intent.id,
          p_terminal_status: 'cancelled',
          p_rail_status: status.status,
          p_error_code: status.error_code ?? null,
          p_error_message: status.message ?? null,
        });
        cancelled++;
      } else {
        // Clean 'pending' from rail. Clear any prior transient error so the
        // 15-min TTL sweep can fire if buyer abandons.
        await sb.rpc('bump_intent_poll', {
          p_intent_id: intent.id,
          p_rail_status: status.status,
          p_error_code: null,
          p_error_message: null,
        });
        stillPending++;
      }
    } catch (e) {
      // S5 transient classification: any thrown error (network, 5xx, timeout,
      // JSON parse) tags last_error_code='RAIL_TRANSIENT' so expire_stale_intents
      // defers TTL on this intent. Buyer may have actually paid; auto-cancel
      // is the wrong action under rail uncertainty.
      console.error(`[cron-poll-intents] transient on intent ${intent.id}:`, e);
      await sb.rpc('bump_intent_poll', {
        p_intent_id: intent.id,
        p_rail_status: intent.rail_status,
        p_error_code: 'RAIL_TRANSIENT',
        p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
      });
      errors++;
    }
  }

  const { data: expiredCount } = await sb.rpc('expire_stale_intents');

  // Phase V.6 — stale Stripe PI sweep. Cancel-first / local-flip-second.
  // The picker (FOR UPDATE SKIP LOCKED) guarantees two overlapping cron ticks
  // never act on the same row.
  let stripeSwept = 0, stripeCancelled = 0, stripeAlreadyTerminal = 0, stripeSkipped = 0;
  const { data: staleStripe, error: stripePickErr } = await sb.rpc('pick_stale_stripe_intents', { p_limit: 50 });
  if (stripePickErr) {
    console.error('[cron-poll-intents] stripe pick error:', stripePickErr);
  } else {
    for (const row of (staleStripe ?? []) as { id: string; rail_intent_id: string }[]) {
      stripeSwept++;
      try {
        // (a) Cancel the PI on Stripe FIRST. paymentIntents.cancel is
        // idempotent for already-canceled PIs (returns the canceled object).
        let piStatus: string | null = null;
        try {
          const cancelled = await stripeClient().paymentIntents.cancel(row.rail_intent_id);
          piStatus = cancelled.status;
        } catch (cancelErr) {
          // Look up actual status. If already canceled -> safe to flip local.
          // If succeeded -> webhook owns it ; skip. Anything else -> log + skip.
          try {
            piStatus = (await stripeClient().paymentIntents.retrieve(row.rail_intent_id)).status;
          } catch (retrieveErr) {
            console.error('[cron-poll-intents] stripe retrieve after cancel error:', { id: row.id, pi: row.rail_intent_id, cancelErr, retrieveErr });
            stripeSkipped++;
            continue;
          }
        }

        if (piStatus === 'succeeded') {
          // (c) Webhook is about to flip / already flipped to completed. Don't
          // touch the local intent — the cron picker won't see this row next
          // tick because the webhook will have set status='completed'.
          stripeAlreadyTerminal++;
          continue;
        }

        if (piStatus !== 'canceled') {
          console.error('[cron-poll-intents] stripe PI in unexpected post-cancel state', { id: row.id, pi: row.rail_intent_id, pi_status: piStatus });
          stripeSkipped++;
          continue;
        }

        // (b) PI is cancelled on Stripe -> safe to flip local atomically.
        const { error: outcomeErr } = await sb.rpc('process_intent_outcome', {
          p_intent_id: row.id,
          p_terminal_status: 'cancelled',
          p_rail_status: 'stripe_expired',
          p_error_code: 'STRIPE_EXPIRED',
          p_error_message: 'Server-side TTL sweep cancelled the Stripe PI before flipping the order.',
        });
        if (outcomeErr) {
          // No catch needed : the PI is already canceled on Stripe, so the
          // worst-case is the cron retries on the next tick. log + carry on.
          console.error('[cron-poll-intents] process_intent_outcome (stripe sweep) error:', { id: row.id, outcomeErr });
          stripeSkipped++;
          continue;
        }
        stripeCancelled++;
      } catch (e) {
        console.error('[cron-poll-intents] stripe sweep iteration error:', { id: row.id, e });
        stripeSkipped++;
      }
    }
  }

  // Booking PI sweep (2026-07-07) — abandoned booking payment sheets. Same
  // cancel-first safety property as the stripe order sweep. 24h TTL (see
  // 20260707_03: the sign-pay idempotency key replays for ~24h — cancelling
  // sooner would hand a returning tenant the same canceled PI). Local action
  // is only clearing bookings.stripe_pi_id — booking status is untouched, an
  // 'accepted' booking stays payable through a fresh sign-pay call.
  let bookingSwept = 0, bookingCancelled = 0, bookingAlreadyTerminal = 0, bookingSkipped = 0;
  const { data: staleBookingPis, error: bookingPickErr } = await sb.rpc('pick_stale_booking_pis', { p_limit: 20 });
  if (bookingPickErr) {
    console.error('[cron-poll-intents] booking pick error:', bookingPickErr);
  } else {
    for (const row of (staleBookingPis ?? []) as { booking_id: string; stripe_pi_id: string; status: string }[]) {
      bookingSwept++;
      try {
        let piStatus: string | null = null;
        try {
          const cancelledPi = await stripeClient().paymentIntents.cancel(row.stripe_pi_id);
          piStatus = cancelledPi.status;
        } catch (_cancelErr) {
          try {
            piStatus = (await stripeClient().paymentIntents.retrieve(row.stripe_pi_id)).status;
          } catch (retrieveErr) {
            console.error('[cron-poll-intents] booking PI retrieve error:', { booking: row.booking_id, pi: row.stripe_pi_id, retrieveErr });
            bookingSkipped++;
            continue;
          }
        }

        if (piStatus === 'succeeded') {
          // The webhook owns this payment (confirm_booking_payment is
          // idempotent). On a cancelled/rejected booking the webhook's
          // status guard logs the conflict — nothing to do here.
          bookingAlreadyTerminal++;
          continue;
        }
        if (piStatus !== 'canceled') {
          console.error('[cron-poll-intents] booking PI in unexpected post-cancel state', { booking: row.booking_id, pi: row.stripe_pi_id, pi_status: piStatus });
          bookingSkipped++;
          continue;
        }

        // Charge window is closed on Stripe — detach the PI locally.
        const { error: clearErr } = await sb
          .from('bookings')
          .update({ stripe_pi_id: null, updated_at: new Date().toISOString() })
          .eq('id', row.booking_id);
        if (clearErr) {
          console.error('[cron-poll-intents] booking PI clear error:', { booking: row.booking_id, clearErr });
          bookingSkipped++;
          continue;
        }
        bookingCancelled++;
      } catch (e) {
        console.error('[cron-poll-intents] booking sweep iteration error:', { booking: row.booking_id, e });
        bookingSkipped++;
      }
    }
  }

  return new Response(JSON.stringify({
    polled, completed, failed, cancelled, stillPending, errors, expired: expiredCount ?? 0,
    stripeSwept, stripeCancelled, stripeAlreadyTerminal, stripeSkipped,
    bookingSwept, bookingCancelled, bookingAlreadyTerminal, bookingSkipped,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
});
