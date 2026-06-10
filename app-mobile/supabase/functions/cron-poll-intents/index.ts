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

import { serviceClient } from '@shared/db.ts';
import { getPaymentStatus } from '@shared/lengopay.ts';
import { notifyOrderPaid } from '@shared/order-paid-push.ts';

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

  return new Response(JSON.stringify({
    polled, completed, failed, cancelled, stillPending, errors, expired: expiredCount ?? 0,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
});
