// Place an order. Authed (requireUser → buyer_id). Calls place_order RPC.
// Wallet branch: order lands at status='paid' with atomic buyer→escrow_gnf
// post_transfer in the RPC. Rail branches: order at 'placed', then
// payment_intent inserted + rail init called from this edge function —
// orange-money / mtn-money via Lengopay v2 (cron-polled), card via Stripe
// PaymentIntent (webhook-driven, Phase Q).
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
import { notifyDetached, displayNameOf, formatGNF } from '@shared/push.ts';
import { stripeClient, stripeConfigured, stripePublishableKey } from '@shared/stripe.ts';
import { DELIVERY_FEE_MINOR } from '@shared/delivery.ts';

interface OrderItemInput { product_id: string; quantity: number }

interface Body {
  /** Multi-article order, ALL from the same shop (client 2026-08-05). When
   *  present it wins over product_id/quantity, which stay accepted so older
   *  installs keep working after an OTA-less update. */
  items?: OrderItemInput[];
  product_id?: string;
  quantity?: number;
  payment_method: 'orange-money' | 'mtn-money' | 'card' | 'wallet';
  /** Mode de réception (client 2026-07-30). 'delivery' = Linky livre (frais
   *  forfaitaire) ; 'pickup' = retrait boutique (gratuit). Absent → 'delivery'
   *  (rétro-compat : toutes les commandes historiques étaient en livraison). */
  delivery_mode?: 'pickup' | 'delivery';
  /** Optional Q6 override. If absent, edge fn looks up primary phone from public.phones. */
  payer_phone?: string;
}

const METHODS = new Set(['orange-money', 'mtn-money', 'card', 'wallet']);
const DELIVERY_MODES = new Set(['pickup', 'delivery']);
const PHONE_RE = /^\+224\d{9}$/;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  const okItem = (v: unknown): boolean => {
    if (typeof v !== 'object' || v === null) return false;
    const i = v as Record<string, unknown>;
    if (typeof i.product_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(i.product_id)) return false;
    return typeof i.quantity === 'number' && Number.isInteger(i.quantity) && i.quantity >= 1 && i.quantity <= 100;
  };
  if (Array.isArray(x.items)) {
    if (x.items.length < 1 || x.items.length > 20) return false;
    if (!x.items.every(okItem)) return false;
  } else {
    if (typeof x.product_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.product_id)) return false;
    if (typeof x.quantity !== 'number' || !Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > 100) return false;
  }
  if (typeof x.payment_method !== 'string' || !METHODS.has(x.payment_method)) return false;
  if (x.delivery_mode !== undefined) {
    if (typeof x.delivery_mode !== 'string' || !DELIVERY_MODES.has(x.delivery_mode)) return false;
  }
  if (x.payer_phone !== undefined) {
    if (typeof x.payer_phone !== 'string' || !PHONE_RE.test(x.payer_phone)) return false;
  }
  return true;
}

// Idempotency-cache filter (wrap.ts contract, same idea as stripTokens) : the
// Stripe client_secret must NOT sit in idempotency_keys.response_body for the
// 24h window — a service-role DB read could replay a live payment credential.
// A replayed idempotent call gets { order, intent } back without the sheet
// bundle ; the live (first) response is unaffected.
function stripPaymentSecret(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const { payment: _payment, ...rest } = body as Record<string, unknown>;
  return rest;
}

Deno.serve(makePost<Body>('/v1/orders/place', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Card needs Stripe configured — check BEFORE the RPC so a missing secret
  // doesn't create an order we'd immediately have to cancel. Same graceful
  // degradation as KYC_NOT_CONFIGURED.
  if (body.payment_method === 'card' && !stripeConfigured()) {
    throwApi('STRIPE_NOT_CONFIGURED', 503, 'Le paiement par carte arrive bientôt.');
  }

  // Mode de réception : 'delivery' par défaut (rétro-compat). Le frais de
  // livraison forfaitaire est décidé côté serveur (le body ne porte JAMAIS le
  // montant) ; retrait sur place = 0.
  const deliveryMode = body.delivery_mode ?? 'delivery';
  const deliveryFeeMinor = deliveryMode === 'delivery' ? DELIVERY_FEE_MINOR : 0;

  // One RPC per shape. place_order_multi enforces the same-seller rule itself,
  // so a tampered payload mixing shops is rejected in the database, not only
  // in the app. Pricing is always computed server-side from products.
  const items: OrderItemInput[] = body.items ?? [
    { product_id: body.product_id as string, quantity: body.quantity as number },
  ];
  const { data: newId, error: rpcErr } = await sb.rpc('place_order_multi', {
    p_buyer_id: userId,
    p_items: items,
    p_payment_method: body.payment_method,
    p_delivery_mode: deliveryMode,
    p_delivery_fee_minor: deliveryFeeMinor,
  });
  if (rpcErr || !newId) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    console.error('[place-order] rpc error:', rpcErr);
    if (msg.includes('PRODUCT_NOT_FOUND'))            throwApi('PRODUCT_NOT_FOUND', 404, 'Produit introuvable.');
    if (msg.includes('PRODUCT_NOT_AVAILABLE'))        throwApi('PRODUCT_NOT_AVAILABLE', 400, 'Produit indisponible.');
    if (msg.includes('BUYER_IS_SELLER'))              throwApi('BUYER_IS_SELLER', 400, "Tu ne peux pas acheter ton propre produit.");
    if (msg.includes('INVALID_QUANTITY'))             throwApi('INVALID_BODY', 400, 'Quantité invalide.');
    if (msg.includes('OUT_OF_STOCK'))                 throwApi('OUT_OF_STOCK', 400, 'Cet article est en rupture de stock.');
    if (msg.includes('INSUFFICIENT_STOCK'))           throwApi('INSUFFICIENT_STOCK', 400, 'Il ne reste plus assez d\'exemplaires de cet article.');
    if (msg.includes('MULTIPLE_SELLERS'))             throwApi('MULTIPLE_SELLERS', 400, "Une commande ne peut contenir que des articles d'une même boutique.");
    if (msg.includes('DUPLICATE_ITEM'))               throwApi('INVALID_BODY', 400, 'Article en double dans la commande.');
    if (msg.includes('TOO_MANY_ITEMS'))               throwApi('INVALID_BODY', 400, "Trop d'articles dans la commande.");
    if (msg.includes('INVALID_ITEMS'))                throwApi('INVALID_BODY', 400, 'Articles invalides.');
    if (msg.includes('INVALID_DELIVERY_MODE'))        throwApi('INVALID_BODY', 400, 'Mode de réception invalide.');
    if (msg.includes('INVALID_DELIVERY_FEE'))         throwApi('INVALID_BODY', 400, 'Frais de livraison invalide.');
    if (msg.includes('PAYMENT_METHOD_NOT_SUPPORTED')) throwApi('PAYMENT_METHOD_NOT_SUPPORTED', 400, 'Carte non supportée pour le moment.');
    if (msg.includes('INSUFFICIENT_FUNDS'))           throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant pour passer cette commande.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur création commande');
  }

  // MONEY-1: place_order has already COMMITTED atomically (for the wallet
  // method it debited buyer→escrow). This readback is only to build the
  // response. A transient failure here must NOT convert into a 500 that makes
  // wrap.ts delete the idempotency reservation — a same-key client retry would
  // then re-run the non-idempotent place_order and DOUBLE-DEBIT the buyer. So we
  // retry the read a few times before ever giving up; in practice the row is
  // always readable and no retry with the same key re-executes the money RPC.
  let row: OrderRow | null = null;
  let readErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await sb
      .from('orders')
      .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, delivery_mode, delivery_fee_minor, payment_method, currency, status, events, release_at, created_at')
      .eq('id', newId)
      .single();
    if (!res.error && res.data) { row = res.data as OrderRow; readErr = null; break; }
    readErr = res.error;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 200));
  }
  if (!row) {
    console.error('[place-order] readback error after retries:', readErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
  }

  if (body.payment_method === 'wallet') {
    // Wallet branch lands the order at 'paid' — tell the seller now.
    // Rail branch only notifies once the intent completes (cron-poll-intents).
    const paidRow = row as OrderRow;
    const buyerName = await displayNameOf(sb, userId);
    notifyDetached(sb, {
      userIds: [paidRow.seller_id],
      category: 'order',
      title: 'Nouvelle commande payée',
      body: `${buyerName} a payé ${formatGNF(Number(paidRow.total_minor))} — prépare la commande.`,
      iconHint: 'check',
      deeplink: `/seller/orders/${paidRow.id}`,
      refType: 'order',
      refId: paidRow.id,
    });
    // Buyer-only response path; never add scan_token to the SELECT or pass
    // opts to mapOrder — scanToken stays undefined so it can't be read back
    // by the buyer who just placed the order.
    return { body: { order: mapOrder(paidRow) } };
  }

  if (body.payment_method === 'card') {
    // ───────────────────────────────────────────────────────────────────────
    // STRIPE RAIL PATH (Phase Q) — same S2 orphan-safe ordering as Lengopay.
    // GNF is zero-decimal on Stripe : amount = total_minor (whole francs).
    // stripe-webhook drives the outcome — this intent is excluded from the
    // Lengopay cron (pick/expire filter rail='lengopay' since 20260610_03).
    // ───────────────────────────────────────────────────────────────────────
    const orderRow = row as OrderRow;

    // GNF-only guard : Stripe amount = total_minor with currency 'gnf'. The
    // payment_intents CHECK admits EUR — an EUR order reaching this branch
    // would charge the EUR total AS GNF. Cancel the just-created order
    // (pre-intent failure path) and reject.
    if (orderRow.currency !== 'GNF') {
      console.error('[place-order] card branch refused non-GNF order', {
        order_id: orderRow.id, currency: orderRow.currency,
      });
      await sb.from('orders').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', orderRow.id);
      throwApi('CURRENCY_NOT_SUPPORTED', 400, 'Le paiement par carte est disponible en GNF uniquement.');
    }

    // S2 Step 1: intent row FIRST with a placeholder rail_intent_id (unique
    // per attempt via embedded uuid). payer_phone stays NULL for cards.
    const placeholderId = `pending-init-${crypto.randomUUID()}`;
    const { data: intentRow, error: intentErr } = await sb
      .from('payment_intents')
      .insert({
        order_id:       orderRow.id,
        rail:           'stripe',
        rail_intent_id: placeholderId,
        method:         'card',
        currency:       orderRow.currency,
        amount_minor:   orderRow.total_minor,
        payer_phone:    null,
      })
      .select('*')
      .single();
    if (intentErr || !intentRow) {
      // Pre-rail-call failure: cancel order directly (no intent to transition).
      await sb.from('orders').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', orderRow.id);
      console.error('[place-order] stripe payment_intent insert error:', intentErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur intent de paiement');
    }

    // S2 Step 2: create the Stripe PaymentIntent. On failure, transition
    // intent → failed, which cancels the order atomically.
    let stripeIntent;
    try {
      stripeIntent = await stripeClient().paymentIntents.create({
        amount: Number(orderRow.total_minor),
        currency: 'gnf',
        automatic_payment_methods: { enabled: true },
        metadata: { order_id: orderRow.id, intent_id: intentRow.id, user_id: userId },
      });
      if (!stripeIntent.client_secret) throw new Error('missing client_secret');
    } catch (e) {
      console.error('[place-order] stripe init error:', e);
      await sb.rpc('process_intent_outcome', {
        p_intent_id:       intentRow.id,
        p_terminal_status: 'failed',
        p_rail_status:     'init_failed',
        p_error_code:      'RAIL_INIT_FAILED',
        p_error_message:   (e instanceof Error ? e.message : String(e)).slice(0, 500),
      });
      throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
    }

    // S2 Step 3: UPDATE intent with the real Stripe PaymentIntent id.
    const { error: updateErr } = await sb
      .from('payment_intents')
      .update({
        rail_intent_id: stripeIntent.id,
        rail_status:    stripeIntent.status,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', intentRow.id);
    if (updateErr) {
      // Stripe has the PI, our row has the placeholder — the webhook can't
      // match it. Mark failed + cancel order, and best-effort cancel the
      // Stripe PI so a stale sheet can't charge a cancelled order.
      console.error('[place-order] CRITICAL stripe intent UPDATE failed post-init', {
        intent_id: intentRow.id, stripe_pi: stripeIntent.id, error: updateErr,
      });
      try {
        await stripeClient().paymentIntents.cancel(stripeIntent.id);
      } catch (cancelErr) {
        console.error('[place-order] CRITICAL stripe PI cancel also failed — manual reconcile needed', {
          stripe_pi: stripeIntent.id, error: cancelErr,
        });
      }
      await sb.rpc('process_intent_outcome', {
        p_intent_id:       intentRow.id,
        p_terminal_status: 'failed',
        p_rail_status:     stripeIntent.status,
        p_error_code:      'INTENT_UPDATE_FAILED',
        p_error_message:   `stripe_pi=${stripeIntent.id} update_err=${updateErr.message}`.slice(0, 500),
      });
      throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement intent');
    }

    const finalIntent: PaymentIntentRow = {
      ...(intentRow as PaymentIntentRow),
      rail_intent_id: stripeIntent.id,
      rail_status: stripeIntent.status,
    };
    // Buyer-only response path; scan_token excluded from the SELECT (see
    // wallet-branch note). payment carries what the payment sheet needs.
    return {
      body: {
        order: mapOrder(orderRow),
        intent: mapPaymentIntent(finalIntent),
        payment: {
          client_secret: stripeIntent.client_secret,
          publishable_key: stripePublishableKey(),
        },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LENGOPAY RAIL PATH — S2 orphan-safe ordering.
  // Only orange-money / mtn-money reach here (wallet + card returned above).
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
  // Lengopay v1 hosted-page flow (verified 2026-07-07): init returns a
  // payment_url where the buyer picks Orange/MTN themselves — no phone or
  // gateway code goes in the init call (payer_phone stays stored on the
  // intent for support/reference).
  let initResp;
  try {
    initResp = await initPayment({
      amount_minor: Number(orderRow.total_minor),
      currency:     intentCurrency as 'GNF' | 'EUR',
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
  // Buyer-only response path (rail flow); never add scan_token to the SELECT
  // or pass opts to mapOrder — scanToken stays undefined. paymentUrl is the
  // Lengopay hosted page the app opens for the buyer to approve.
  return {
    body: {
      order: mapOrder(orderRow),
      intent: { ...mapPaymentIntent(finalIntent), paymentUrl: initResp.payment_url },
    },
  };
}, stripPaymentSecret));
