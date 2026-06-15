// Card-funded wallet top-up (Phase: card recharge). Mobile Money top-up stays
// contract-blocked on Lengopay ; card is the only wet funding rail today.
//
// Flow (mirrors place-order's Stripe path, but for the wallet, not an order):
//   1. record a PENDING topup_intents row (GNF, method='card') ;
//   2. create a Stripe PaymentIntent tagged metadata.kind='topup' so
//      stripe-webhook routes payment_intent.succeeded to confirm_topup
//      (the idempotent one-sided wallet credit) instead of the order flow ;
//   3. return client_secret to the app's PaymentSheet.
// If the Stripe init fails we delete the orphan topup_intent so it can never
// be confirmed later.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { stripeClient, stripeConfigured, stripePublishableKey } from '@shared/stripe.ts';

const MIN_TOPUP = 10_000;      // 10 000 GNF floor (card fees make tiny top-ups silly)
const MAX_TOPUP = 50_000_000;  // 50M GNF ceiling (sanity bound)

interface Body { amount_minor: number }

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Body;
  return typeof x.amount_minor === 'number'
    && Number.isInteger(x.amount_minor)
    && x.amount_minor >= MIN_TOPUP
    && x.amount_minor <= MAX_TOPUP;
}

Deno.serve(makePost<Body>('/v1/wallet/topup-card', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  if (!stripeConfigured()) {
    throwApi('STRIPE_NOT_CONFIGURED', 503, 'Le paiement par carte arrive bientôt.');
  }

  // 1. Pending top-up record. Card always funds the GNF wallet.
  const { data: topup, error: tErr } = await sb
    .from('topup_intents')
    .insert({ user_id: userId, currency: 'GNF', amount_minor: body.amount_minor, method: 'card' })
    .select('id, amount_minor')
    .single();
  if (tErr || !topup) {
    console.error('[wallet-topup-card] topup insert error:', tErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  // 2. Stripe PaymentIntent. GNF is zero-decimal : amount = whole francs.
  let pi;
  try {
    pi = await stripeClient().paymentIntents.create({
      amount: Number(topup.amount_minor),
      currency: 'gnf',
      automatic_payment_methods: { enabled: true },
      metadata: { kind: 'topup', topup_intent_id: topup.id, user_id: userId },
    });
    if (!pi.client_secret) throw new Error('missing client_secret');
  } catch (e) {
    console.error('[wallet-topup-card] stripe init error:', e);
    // Remove the orphan so a later stray webhook can never confirm it.
    await sb.from('topup_intents').delete().eq('id', topup.id);
    throwApi('INTERNAL_ERROR', 500, 'Erreur initialisation du paiement');
  }

  return {
    body: {
      topup_id: topup.id,
      client_secret: pi.client_secret,
      publishable_key: stripePublishableKey(),
    },
  };
}));
