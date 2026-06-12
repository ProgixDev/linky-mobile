// Get a single order. Authed; caller must be buyer OR seller (no public order
// pages — orders are private to participants). Response now includes the
// latest payment_intent for the order (null if none — wallet orders have no
// payment_intent). The frontend confirmation screen relies on this combined
// shape to avoid TanStack refetch race between two queries.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapOrder, mapPaymentIntent, type OrderRow, type PaymentIntentRow } from '@shared/catalog.ts';

interface Body { id: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.id === 'string' && /^[0-9a-f-]{36}$/i.test(x.id);
}

// Phase V.3a -- strip scanToken from the idempotency cache before
// persistence. The LIVE response a seller gets in the current request
// still carries scanToken (that's the whole point — they need it to
// print the QR). But the cached copy a service-role DB read could pull
// up over the 24h TTL window must NOT carry the secret : a future
// audit-log or admin replay path that reads idempotency_keys.response_body
// would otherwise expose the QR token via the cached row.
function stripScanToken(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const x = body as Record<string, unknown>;
  if (x.order && typeof x.order === 'object') {
    const { scanToken: _t, ...orderRest } = x.order as Record<string, unknown>;
    return { ...x, order: orderRest };
  }
  return body;
}

Deno.serve(makePost<Body>('/v1/orders/get', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: row, error } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events, release_at, created_at, scan_token')
    .eq('id', body.id)
    .maybeSingle();
  if (error) {
    console.error('[get-order] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!row) throwApi('ORDER_NOT_FOUND', 404, 'Commande introuvable.');
  const r = row as OrderRow;
  if (r.buyer_id !== userId && r.seller_id !== userId) {
    throwApi('FORBIDDEN', 403, 'Action refusée.');
  }
  // PII gate: only the seller may see the scan_token (it's the QR secret
  // they print on the package; buyer learns it ONLY by scanning the QR).
  const isSeller = r.seller_id === userId;

  // Latest payment_intent for this order. Currently attempt_index stays at 1
  // (V1 retry creates a NEW order, not a new attempt on the same one).
  // Ordering defensively by attempt_index + created_at descending so a future
  // on-same-order retry pattern continues to return the latest.
  const { data: intentRow, error: intentErr } = await sb
    .from('payment_intents')
    .select('id, order_id, rail, rail_intent_id, rail_status, status, method, currency, amount_minor, payer_phone, attempt_index, attempts_count, last_polled_at, last_error_code, last_error_message, created_at, updated_at, completed_at')
    .eq('order_id', body.id)
    .order('attempt_index', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (intentErr) {
    console.error('[get-order] intent query error:', intentErr);
    // Continue with intent: null - order is primary. Intent absence surfaces
    // in UI as wallet path, which is visibly wrong for rail orders, so the
    // error doesn't stay silent.
  }

  return {
    body: {
      // PII opt-in: includeScanToken is true only when the caller is the seller
      // of this order. Buyer/agent callers get scanToken=undefined in the
      // mapped payload, preventing the QR-bypass deep-link path.
      order:  mapOrder(r, { includeScanToken: isSeller }),
      intent: intentRow ? mapPaymentIntent(intentRow as PaymentIntentRow) : null,
    },
  };
}, stripScanToken));
