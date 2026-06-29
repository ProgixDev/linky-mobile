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
  // PII gate (Phase LIVREUR) : seller AND buyer may both receive scan_token.
  // OLD path : seller printed the QR on the package, buyer self-scanned.
  // NEW path : buyer renders the QR on-screen for a livreur to scan at
  // handoff. Both paths coexist (hand-carry still uses the seller-prints
  // route), so both audiences are legitimate. The token is still hidden
  // from any other caller (admin uses a separate admin endpoint).
  const isParticipant = r.buyer_id === userId || r.seller_id === userId;

  // Delivery summary (Phase LIVREUR — seller assign). Surfaced to participants
  // so the seller order screen can render the assignment state (pick / change /
  // who's delivering) without a second round-trip. Name only — no livreur phone
  // or PII (contact stays on-platform ; the assigned livreur reaches the buyer
  // through the app, not the seller forwarding a number). One row per order
  // (deliveries.order_id is unique), so maybeSingle is safe.
  const { data: deliveryRow, error: deliveryErr } = await sb
    .from('deliveries')
    .select('id, status, livreur_id, delivery_address, gps_lat, gps_lng, livreur_lat, livreur_lng, livreur_location_at')
    .eq('order_id', body.id)
    .maybeSingle();
  if (deliveryErr) {
    console.error('[get-order] delivery query error:', deliveryErr);
    // Non-fatal : the order is primary. delivery stays null → the seller UI
    // just won't show the picker this cycle (it reappears on next refetch).
  }
  let delivery: {
    status: string;
    city: string | null;
    livreurId: string | null;
    livreurName: string | null;
    clientLocation: { lat: number; lng: number } | null;
    livreurLocation: { lat: number; lng: number; at: string | null } | null;
  } | null = null;
  if (deliveryRow) {
    const d = deliveryRow as {
      id: string;
      status: string;
      livreur_id: string | null;
      delivery_address: Record<string, unknown> | null;
      gps_lat: number | string | null;
      gps_lng: number | string | null;
      livreur_lat: number | string | null;
      livreur_lng: number | string | null;
      livreur_location_at: string | null;
    };
    let livreurName: string | null = null;
    if (d.livreur_id) {
      const { data: livreur } = await sb
        .from('users')
        .select('display_name')
        .eq('id', d.livreur_id)
        .maybeSingle();
      livreurName = (livreur?.display_name as string | null) ?? null;
    }
    delivery = {
      status: d.status,
      city: (d.delivery_address?.city as string | null) ?? null,
      livreurId: d.livreur_id,
      livreurName,
      // Drop-off (client) + the courier's last live position — feeds the buyer's
      // tracking map. quartier/ville-level coords; livreurLocation null until the
      // first ping.
      clientLocation:
        d.gps_lat != null && d.gps_lng != null
          ? { lat: Number(d.gps_lat), lng: Number(d.gps_lng) }
          : null,
      livreurLocation:
        d.livreur_lat != null && d.livreur_lng != null
          ? { lat: Number(d.livreur_lat), lng: Number(d.livreur_lng), at: d.livreur_location_at }
          : null,
    };
  }

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
      // PII opt-in (Phase LIVREUR) : both buyer and seller receive scan_token.
      // Buyer needs it to render their own on-screen QR for livreur handoff ;
      // seller still gets it for the legacy printed-QR path. Non-participants
      // never reach this branch (FORBIDDEN above).
      order:  { ...mapOrder(r, { includeScanToken: isParticipant }), delivery },
      intent: intentRow ? mapPaymentIntent(intentRow as PaymentIntentRow) : null,
    },
  };
}, stripScanToken));
