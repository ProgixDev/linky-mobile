// Cron worker for payment_intents. Triggered every 5s via pg_cron →
// kick_payment_intents_poll() → net.http_post() → this function.
//
// S3: defended by x-cron-secret header. Compares LINKY_CRON_SECRET env var
// (injected at deploy time) to the header value the kick function includes.
// Without this, anyone with the public anon key could POST here.
//
// Tick body:
//   1. pick_intents_to_poll(200) — backoff-aware FOR UPDATE SKIP LOCKED
//   2. For each: getStatusForRail(method, rail_intent_id) — v1 pour la carte
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
// v2 depuis le 2026-09-05 : les intentions Lengopay sont desormais creees par
// /api/v2/payments (paiement in-app), donc on sonde /api/v2/transaction/status.
// Aucune intention v1 ne peut survivre au deploiement : le balayage TTL de
// 15 min les termine proprement, comme un paiement abandonne.
import { getStatusForRail } from '@shared/lengopay.ts';
import { notifyOrderPaid } from '@shared/order-paid-push.ts';
import { stripeClient } from '@shared/stripe.ts';

interface PendingIntent {
  id: string;
  rail_intent_id: string;
  rail: string;
  /** Decide l'API a interroger : la carte guineenne nait sur la page hebergee
   *  (v1), tout le reste sur la v2. Voir getStatusForRail. */
  method: string;
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
      const status = await getStatusForRail(intent.method, intent.rail_intent_id);

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

  // ── Booking intents (Lengopay) — ISOLATED from the order path above. Same
  //    poll → outcome pattern, but process_booking_intent_outcome delegates to
  //    confirm_booking_payment on success and leaves the booking 'accepted' on
  //    failure so the tenant can retry (client 2026-07-29: rentals moved off the
  //    dropped Stripe rail onto Orange/MTN, same rail as product orders).
  let bkPolled = 0, bkCompleted = 0, bkFailed = 0, bkCancelled = 0, bkPending = 0, bkErrors = 0;
  const { data: bookingIntents, error: bkPickErr } = await sb.rpc('pick_booking_intents_to_poll', { p_limit: 200 });
  if (bkPickErr) {
    console.error('[cron-poll-intents] booking intent pick error:', bkPickErr);
  } else {
    for (const intent of (bookingIntents ?? []) as PendingIntent[]) {
      bkPolled++;
      try {
        const status = await getStatusForRail(intent.method, intent.rail_intent_id);
        if (status.status === 'success') {
          const { error: oErr } = await sb.rpc('process_booking_intent_outcome', {
            p_intent_id: intent.id, p_terminal_status: 'completed', p_rail_status: status.status,
            p_error_code: null, p_error_message: null,
          });
          if (oErr) throw new Error(`process_booking_intent_outcome failed: ${oErr.message}`);
          bkCompleted++;
        } else if (status.status === 'failed' || status.status === 'cancelled') {
          await sb.rpc('process_booking_intent_outcome', {
            p_intent_id: intent.id, p_terminal_status: status.status, p_rail_status: status.status,
            p_error_code: status.error_code ?? null, p_error_message: status.message ?? null,
          });
          if (status.status === 'failed') bkFailed++; else bkCancelled++;
        } else {
          await sb.rpc('bump_intent_poll', {
            p_intent_id: intent.id, p_rail_status: status.status, p_error_code: null, p_error_message: null,
          });
          bkPending++;
        }
      } catch (e) {
        console.error(`[cron-poll-intents] booking transient on intent ${intent.id}:`, e);
        await sb.rpc('bump_intent_poll', {
          p_intent_id: intent.id, p_rail_status: intent.rail_status,
          p_error_code: 'RAIL_TRANSIENT', p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        });
        bkErrors++;
      }
    }
  }
  const { data: bkExpired } = await sb.rpc('expire_stale_booking_intents');

  // ── Boost intents (Lengopay) — troisieme chemin, isole des deux autres
  //    (client 2026-08-12 : booster par Orange Money / MTN et pas seulement par
  //    portefeuille). Sur succes, process_boost_intent_outcome delegue a
  //    confirm_boost_payment, qui active le boost et remonte l'annonce ; sur
  //    echec le boost reserve est annule et l'annonce n'a jamais bouge.
  let boPolled = 0, boCompleted = 0, boFailed = 0, boCancelled = 0, boPending = 0, boErrors = 0;
  const { data: boostIntents, error: boPickErr } = await sb.rpc('pick_boost_intents_to_poll', { p_limit: 200 });
  if (boPickErr) {
    console.error('[cron-poll-intents] boost intent pick error:', boPickErr);
  } else {
    for (const intent of (boostIntents ?? []) as PendingIntent[]) {
      boPolled++;
      try {
        const status = await getStatusForRail(intent.method, intent.rail_intent_id);
        if (status.status === 'success') {
          const { error: oErr } = await sb.rpc('process_boost_intent_outcome', {
            p_intent_id: intent.id, p_terminal_status: 'completed', p_rail_status: status.status,
            p_error_code: null, p_error_message: null,
          });
          if (oErr) throw new Error(`process_boost_intent_outcome failed: ${oErr.message}`);
          boCompleted++;
        } else if (status.status === 'failed' || status.status === 'cancelled') {
          await sb.rpc('process_boost_intent_outcome', {
            p_intent_id: intent.id, p_terminal_status: status.status, p_rail_status: status.status,
            p_error_code: status.error_code ?? null, p_error_message: status.message ?? null,
          });
          if (status.status === 'failed') boFailed++; else boCancelled++;
        } else {
          await sb.rpc('bump_intent_poll', {
            p_intent_id: intent.id, p_rail_status: status.status, p_error_code: null, p_error_message: null,
          });
          boPending++;
        }
      } catch (e) {
        console.error(`[cron-poll-intents] boost transient on intent ${intent.id}:`, e);
        await sb.rpc('bump_intent_poll', {
          p_intent_id: intent.id, p_rail_status: intent.rail_status,
          p_error_code: 'RAIL_TRANSIENT', p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        });
        boErrors++;
      }
    }
  }
  const { data: boExpired } = await sb.rpc('expire_stale_boost_intents');

  // ── Intentions de LOT (panier multi-boutiques, client 2026-08-21). Un seul
  //    paiement couvre N commandes. process_batch_intent_outcome verifie que la
  //    somme des totaux vaut EXACTEMENT le montant encaisse avant de creer la
  //    moindre ecriture de sequestre — un lot dont une commande aurait bouge
  //    entre-temps est refuse plutot que regle de travers.
  let baPolled = 0, baCompleted = 0, baFailed = 0, baCancelled = 0, baPending = 0, baErrors = 0;
  const { data: batchIntents, error: baPickErr } = await sb.rpc('pick_batch_intents_to_poll', { p_limit: 200 });
  if (baPickErr) {
    console.error('[cron-poll-intents] batch intent pick error:', baPickErr);
  } else {
    for (const intent of (batchIntents ?? []) as PendingIntent[]) {
      baPolled++;
      try {
        const status = await getStatusForRail(intent.method, intent.rail_intent_id);
        if (status.status === 'success') {
          const { error: oErr } = await sb.rpc('process_batch_intent_outcome', {
            p_intent_id: intent.id, p_terminal_status: 'completed', p_rail_status: status.status,
            p_error_code: null, p_error_message: null,
          });
          if (oErr) throw new Error(`process_batch_intent_outcome failed: ${oErr.message}`);
          // Trou trouve le 2026-08-24 en cablant la carte pour les lots : cette
          // branche ne notifiait jamais les vendeurs d'un lot Lengopay paye —
          // notifyOrderPaid est desormais capable de lot (voir order-paid-push.ts).
          await notifyOrderPaid(sb, intent.id);
          baCompleted++;
        } else if (status.status === 'failed' || status.status === 'cancelled') {
          await sb.rpc('process_batch_intent_outcome', {
            p_intent_id: intent.id, p_terminal_status: status.status, p_rail_status: status.status,
            p_error_code: status.error_code ?? null, p_error_message: status.message ?? null,
          });
          if (status.status === 'failed') baFailed++; else baCancelled++;
        } else {
          await sb.rpc('bump_intent_poll', {
            p_intent_id: intent.id, p_rail_status: status.status, p_error_code: null, p_error_message: null,
          });
          baPending++;
        }
      } catch (e) {
        console.error(`[cron-poll-intents] batch transient on intent ${intent.id}:`, e);
        await sb.rpc('bump_intent_poll', {
          p_intent_id: intent.id, p_rail_status: intent.rail_status,
          p_error_code: 'RAIL_TRANSIENT', p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        });
        baErrors++;
      }
    }
  }
  const { data: baExpired } = await sb.rpc('expire_stale_batch_intents');


  // Phase V.6 — stale Stripe PI sweep. Cancel-first / local-flip-second.
  // The picker (FOR UPDATE SKIP LOCKED) guarantees two overlapping cron ticks
  // never act on the same row.
  let stripeSwept = 0, stripeCancelled = 0, stripeAlreadyTerminal = 0, stripeSkipped = 0;
  const { data: staleStripe, error: stripePickErr } = await sb.rpc('pick_stale_stripe_intents', { p_limit: 50 });
  if (stripePickErr) {
    console.error('[cron-poll-intents] stripe pick error:', stripePickErr);
  } else {
    for (const row of (staleStripe ?? []) as { id: string; batch_id: string | null; rail_intent_id: string }[]) {
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
          // Filet de securite ajoute le 2026-08-25, en reponse a un incident
          // reel : Stripe a signale 4 echecs de livraison de webhook sur ce
          // compte. AVANT ce correctif, cette branche se contentait de sauter
          // la ligne — « le webhook va s'en charger ». Si le webhook echoue a
          // livrer cet evenement, pour n'importe quelle raison, la commande
          // restait bloquee indefiniment en 'placed' : l'argent reellement
          // preleve sur la carte du client, jamais entre en sequestre, le
          // vendeur jamais prevenu. Personne ne s'en apercevait avant une
          // reclamation du client.
          //
          // On regle donc l'intention ICI, immediatement — sans attendre le
          // webhook. Les deux RPC sont idempotentes (elles verifient
          // status = 'pending' avant d'agir) : si le webhook finit par livrer
          // l'evenement malgre tout, son appel ne fait rien de plus, sans
          // risque de credit double.
          const { error: reconcileErr } = await sb.rpc(
            row.batch_id ? 'process_batch_intent_outcome' : 'process_intent_outcome',
            {
              p_intent_id: row.id, p_terminal_status: 'completed', p_rail_status: piStatus,
              p_error_code: null, p_error_message: null,
            },
          );
          if (reconcileErr) {
            // Cas CRITIQUE : l'argent est chez Stripe, notre reglement echoue.
            // Ne PAS marquer stripeAlreadyTerminal — le prochain passage du
            // cron (5 secondes) reessaiera cette meme ligne.
            console.error('[cron-poll-intents] CRITICAL stripe succeeded-reconcile failed — retry next tick', {
              id: row.id, batch_id: row.batch_id, pi: row.rail_intent_id, reconcileErr,
            });
            stripeSkipped++;
            continue;
          }
          // Meme notification que le webhook aurait envoyee au vendeur — sans
          // elle, un paiement regle par ce filet de secours resterait
          // silencieux pour lui.
          await notifyOrderPaid(sb, row.id);
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

  // ─── Balayage des PaymentIntents de BOOST abandonnees (2026-09-07) ─────────
  // Meme mecanique que les reservations juste au-dessus, meme TTL de 24 h (la
  // cle d'idempotence Stripe 'boost-pi-<id>' rejoue pendant ~24 h : annuler la
  // PI avant rendrait au vendeur qui revient la MEME PI, annulee). Sans ce
  // balayage, une feuille de paiement abandonnee resterait encaissable
  // indefiniment — le boost carte ne cree aucune ligne payment_intents, donc
  // aucun des balayages existants ne le voit.
  let boostSwept = 0, boostCancelled = 0, boostAlreadyTerminal = 0, boostSkipped = 0;
  const { data: staleBoostPis, error: boostPickErr } = await sb.rpc('pick_stale_boost_pis', { p_limit: 20 });
  if (boostPickErr) {
    console.error('[cron-poll-intents] boost pick error:', boostPickErr);
  } else {
    for (const row of (staleBoostPis ?? []) as { boost_id: string; stripe_pi_id: string; status: string }[]) {
      boostSwept++;
      try {
        let piStatus: string | null = null;
        try {
          const cancelledPi = await stripeClient().paymentIntents.cancel(row.stripe_pi_id);
          piStatus = cancelledPi.status;
        } catch (_cancelErr) {
          try {
            piStatus = (await stripeClient().paymentIntents.retrieve(row.stripe_pi_id)).status;
          } catch (retrieveErr) {
            console.error('[cron-poll-intents] boost PI retrieve error:', { boost: row.boost_id, pi: row.stripe_pi_id, retrieveErr });
            boostSkipped++;
            continue;
          }
        }

        if (piStatus === 'succeeded') {
          // Le webhook est proprietaire de ce paiement (confirm_boost_payment
          // est idempotente). Rien a faire ici.
          boostAlreadyTerminal++;
          continue;
        }
        if (piStatus !== 'canceled') {
          console.error('[cron-poll-intents] boost PI in unexpected post-cancel state', { boost: row.boost_id, pi: row.stripe_pi_id, pi_status: piStatus });
          boostSkipped++;
          continue;
        }

        // Fenetre d'encaissement fermee chez Stripe — on detache la PI. Le
        // statut du boost n'est PAS touche : 'pending_payment' reste payable
        // par un nouvel appel, qui creera une PI neuve.
        const { error: clearErr } = await sb.rpc('clear_boost_stripe_pi', { p_boost_id: row.boost_id });
        if (clearErr) {
          console.error('[cron-poll-intents] boost PI clear error:', { boost: row.boost_id, clearErr });
          boostSkipped++;
          continue;
        }
        boostCancelled++;
      } catch (e) {
        console.error('[cron-poll-intents] boost sweep iteration error:', { boost: row.boost_id, e });
        boostSkipped++;
      }
    }
  }

  return new Response(JSON.stringify({
    polled, completed, failed, cancelled, stillPending, errors, expired: expiredCount ?? 0,
    bkPolled, bkCompleted, bkFailed, bkCancelled, bkPending, bkErrors, bkExpired: bkExpired ?? 0,
    boPolled, boCompleted, boFailed, boCancelled, boPending, boErrors, boExpired: boExpired ?? 0,
    baPolled, baCompleted, baFailed, baCancelled, baPending, baErrors, baExpired: baExpired ?? 0,
    stripeSwept, stripeCancelled, stripeAlreadyTerminal, stripeSkipped,
    bookingSwept, bookingCancelled, bookingAlreadyTerminal, bookingSkipped,
    boostSwept, boostCancelled, boostAlreadyTerminal, boostSkipped,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
});
