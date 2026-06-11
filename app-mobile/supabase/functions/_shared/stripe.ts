// Phase Q — Stripe client (TEST mode now ; LIVE = sk_test_→sk_live_ swap +
// webhook re-registration once the client's US LLC exists).
//
// GNF is in Stripe's zero-decimal list : amount = total_minor directly (whole
// francs), currency 'gnf'. The buyer's bank does the FX — no EUR conversion,
// no FX in our ledger.
//
// Secrets : LINKY_STRIPE_SECRET_KEY, LINKY_STRIPE_WEBHOOK_SECRET,
// LINKY_STRIPE_PUBLISHABLE_KEY (served to the app via place-order so a key
// rotation never needs an app release). When the secret key is unset,
// place-order rejects 'card' with STRIPE_NOT_CONFIGURED (503) — same
// graceful-degradation pattern as KYC_NOT_CONFIGURED.

import Stripe from 'stripe';

let _client: Stripe | null = null;

// Gate requires BOTH keys (review hardening 2026-06-11) : with the secret key
// alone, buyers can pay on Stripe but the webhook 401s every delivery and the
// order stays 'placed' forever — stripe intents are excluded from the
// Lengopay polls/sweeps by design, so nothing else would ever flip it.
export function stripeConfigured(): boolean {
  return Boolean(Deno.env.get('LINKY_STRIPE_SECRET_KEY')) &&
         Boolean(Deno.env.get('LINKY_STRIPE_WEBHOOK_SECRET'));
}

export function stripeClient(): Stripe {
  if (_client) return _client;
  const key = Deno.env.get('LINKY_STRIPE_SECRET_KEY');
  if (!key) throw new Error('stripe_not_configured');
  // Deno edge runtime : fetch-based HTTP client (no Node http module).
  _client = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return _client;
}

export function stripePublishableKey(): string {
  return Deno.env.get('LINKY_STRIPE_PUBLISHABLE_KEY') ?? '';
}

// SubtleCrypto provider : Deno has no Node crypto, and the sync constructEvent
// can't await SubtleCrypto — hence constructEventAsync.
const subtleCryptoProvider = Stripe.createSubtleCryptoProvider();

/** Verify + parse a Stripe webhook delivery. Throws on bad signature or unset secret. */
export async function constructWebhookEvent(rawBody: string, sigHeader: string): Promise<Stripe.Event> {
  const secret = Deno.env.get('LINKY_STRIPE_WEBHOOK_SECRET');
  if (!secret) throw new Error('stripe_webhook_secret_unset');
  return await stripeClient().webhooks.constructEventAsync(
    rawBody,
    sigHeader,
    secret,
    undefined,
    subtleCryptoProvider,
  );
}
