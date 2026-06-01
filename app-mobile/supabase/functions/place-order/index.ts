// Place an order. Authed (requireUser → buyer_id). Calls place_order RPC.
// Wallet branch: order lands at status='paid' with atomic buyer→escrow_gnf
// post_transfer in the RPC. Rail branch (orange-money / mtn-money): order at
// 'placed', then payment_intent inserted + Lengopay v2 init called from this
// edge function. Card method rejected (Phase I' Stripe takes cards).
//
// Rail flow ordering (S2 orphan-safe per Phase I.3 review):
//   1. RPC inserts order at 'placed' (atomic)
//   2. Insert payment_intents with PLACEHOLDER rail_intent_id (atomic)
//   3. Call Lengopay init
//   4. UPDATE payment_intents.rail_intent_id with real pay_id
//   If 2 fails: cancel order. If 3 fails: process_intent_outcome(failed)
//   atomically marks intent + cancels order. If 4 fails: same.
//   No orphans.

import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapOrder, mapPaymentIntent, type OrderRow, type PaymentIntentRow } from '@shared/catalog.ts';
import { initPayment } from '@shared/lengopay.ts';
import { methodToAccountType } from '@shared/lengopay-types.ts';

interface Body {
  product_id: string;
  quantity: number;
  payment_method: 'orange-money' | 'mtn-money' | 'card' | 'wallet';
  /** Optional Q6 override. If absent, edge fn looks up primary phone from public.phones. */
  payer_phone?: string;
}

const METHODS = new Set(['orange-money', 'mtn-money', 'card', 'wallet']);
const PHONE_RE = /^\+224\d{9}$/;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.product_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.product_id)) return false;
  if (typeof x.quantity !== 'number' || !Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > 100) return false;
  if (typeof x.payment_method !== 'string' || !METHODS.has(x.payment_method)) return false;
  if (x.payer_phone !== undefined) {
    if (typeof x.payer_phone !== 'string' || !PHONE_RE.test(x.payer_phone)) return false;
  }
  return true;
}

Deno.serve(makePost<Body>('/v1/orders/place', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: newId, error: rpcErr } = await sb.rpc('place_order', {
    p_buyer_id: userId,
    p_product_id: body.product_id,
    p_quantity: body.quantity,
    p_payment_method: body.payment_method,
  });
  if (rpcErr || !newId) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    console.error('[place-order] rpc error:', rpcErr);
    if (msg.includes('PRODUCT_NOT_FOUND'))            throwApi('PRODUCT_NOT_FOUND', 404, 'Produit introuvable.');
    if (msg.includes('PRODUCT_NOT_AVAILABLE'))        throwApi('PRODUCT_NOT_AVAILABLE', 400, 'Produit indisponible.');
    if (msg.includes('BUYER_IS_SELLER'))              throwApi('BUYER_IS_SELLER', 400, "Tu ne peux pas acheter ton propre produit.");
    if (msg.includes('INVALID_QUANTITY'))             throwApi('INVALID_BODY', 400, 'Quantité invalide.');
    if (msg.includes('PAYMENT_METHOD_NOT_SUPPORTED')) throwApi('PAYMENT_METHOD_NOT_SUPPORTED', 400, 'Carte non supportée pour le moment.');
    if (msg.includes('INSUFFICIENT_FUNDS'))           throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant pour passer cette commande.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur création commande');
  }

  const { data: row, error: readErr } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events, release_at, created_at')
    .eq('id', newId)
    .single();
  if (readErr || !row) {
    console.error('[place-order] readback error:', readErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
  }

  if (body.payment_method === 'wallet') {
    return { body: { order: mapOrder(row as OrderRow) } };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RAIL PATH — S2 orphan-safe ordering.
  // Card is already rejected at the RPC. Only orange-money / mtn-money reach here.
  // ─────────────────────────────────────────────────────────────────────────

  // Q6 phone capture: pre-fill from primary phone, allow body override.
  let payerPhone = body.payer_phone;
  if (!payerPhone) {
    const { data: phoneRow } = await sb
      .from('phones').select('e164').eq('user_id', userId).eq('is_primary', true).maybeSingle();
    payerPhone = phoneRow?.e164 ?? undefined;
  }
  if (!payerPhone) throwApi('PAYER_PHONE_REQUIRED', 400, 'Numéro de paiement requis');

  const orderRow = row as OrderRow;
  const intentCurrency = orderRow.currency;  // NOT NULL with default 'GNF' per Phase I.1

  // S2 Step 1: insert payment_intent FIRST with a placeholder rail_intent_id.
  // Unique constraint on (rail, rail_intent_id) requires placeholder uniqueness,
  // so each placeholder embeds a uuid. If init fails later, this row gets
  // transitioned to 'failed' via process_intent_outcome — no orphans.
  const placeholderId = `pending-init-${crypto.randomUUID()}`;
  const { data: intentRow, error: intentErr } = await sb
    .from('payment_intents')
    .insert({
      order_id:       orderRow.id,
      rail:           'lengopay',
      rail_intent_id: placeholderId,
      method:         body.payment_method,
      currency:       intentCurrency,
      amount_minor:   orderRow.total_minor,
      payer_phone:    payerPhone,
    })
    .select('*')
    .single();
  if (intentErr || !intentRow) {
    // Pre-rail-call failure: cancel order directly (no intent to transition).
    await sb.from('orders').update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    }).eq('id', orderRow.id);
    console.error('[place-order] payment_intent insert error:', intentErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur intent de paiement');
  }

  // S2 Step 2: call Lengopay init. On failure, transition intent → failed,
  // which cancels the order atomically via process_intent_outcome.
  let initResp;
  try {
    initResp = await initPayment({
      amount:         String(orderRow.total_minor),
      currency:       intentCurrency,
      website_id:     Deno.env.get('LINKY_LENGOPAY_WEBSITE_ID') ?? '',
      account_type:   methodToAccountType(body.payment_method as 'orange-money' | 'mtn-money'),
      account_number: payerPhone,
    });
  } catch (e) {
    console.error('[place-order] lengopay init error:', e);
    await sb.rpc('process_intent_outcome', {
      p_intent_id:       intentRow.id,
      p_terminal_status: 'failed',
      p_rail_status:     'init_failed',
      p_error_code:      'RAIL_INIT_FAILED',
      p_error_message:   (e instanceof Error ? e.message : String(e)).slice(0, 500),
    });
    throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
  }

  // S2 Step 3: UPDATE intent with real rail_intent_id from Lengopay.
  const { error: updateErr } = await sb
    .from('payment_intents')
    .update({
      rail_intent_id: initResp.pay_id,
      rail_status:    initResp.status,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', intentRow.id);
  if (updateErr) {
    // Edge case: Lengopay has the intent, our row has the placeholder.
    // Cron CAN'T poll this rail_intent_id (it's our placeholder, not Lengopay's).
    // Mark intent failed + cancel order; log heavily so ops can manually
    // reconcile against Lengopay's pay_id.
    console.error('[place-order] CRITICAL intent UPDATE failed post-init', {
      intent_id: intentRow.id, pay_id: initResp.pay_id, error: updateErr,
    });
    await sb.rpc('process_intent_outcome', {
      p_intent_id:       intentRow.id,
      p_terminal_status: 'failed',
      p_rail_status:     initResp.status,
      p_error_code:      'INTENT_UPDATE_FAILED',
      p_error_message:   `pay_id=${initResp.pay_id} update_err=${updateErr.message}`.slice(0, 500),
    });
    throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement intent');
  }

  // Return the merged final intent (DB row + real rail_intent_id from response).
  const finalIntent: PaymentIntentRow = {
    ...(intentRow as PaymentIntentRow),
    rail_intent_id: initResp.pay_id,
    rail_status: initResp.status,
  };
  return { body: { order: mapOrder(orderRow), intent: mapPaymentIntent(finalIntent) } };
}));
