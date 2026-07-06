// Tenant signs the contract (hold-to-confirm client-side) and pays: creates a
// Stripe PaymentIntent tagged metadata.kind='booking' so stripe-webhook routes
// payment_intent.succeeded to confirm_booking_payment (idempotent escrow
// credit + status accepted→paid). Mirrors wallet-topup-card's PI pattern.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { stripeClient, stripeConfigured, stripePublishableKey } from '@shared/stripe.ts';

interface Body { booking_id: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.booking_id === 'string' && UUID_RE.test(x.booking_id);
}

Deno.serve(makePost<Body>('/v1/bookings/sign-pay', valid, async ({ sb, body, req }) => {
  const tenantId = await requireUser(req);
  if (!stripeConfigured()) {
    throwApi('STRIPE_NOT_CONFIGURED', 503, 'Le paiement par carte arrive bientôt.');
  }

  const { data: bk, error: eBk } = await sb
    .from('bookings')
    .select('id, tenant_id, status, total_minor, currency')
    .eq('id', body.booking_id)
    .maybeSingle();
  if (eBk) { console.error('[booking-sign-pay] lookup:', eBk); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!bk) throwApi('BOOKING_NOT_FOUND', 404, 'Réservation introuvable.');
  if (bk.tenant_id !== tenantId) throwApi('FORBIDDEN', 403, 'Action refusée.');
  if (bk.status !== 'accepted') {
    throwApi('INVALID_STATUS', 409, bk.status === 'paid'
      ? 'Cette réservation est déjà payée.'
      : "Le propriétaire n'a pas encore signé cette réservation.");
  }

  let pi;
  try {
    // Stripe idempotency key derived from the booking (review DEFECT-2):
    // repeated sign-pay calls return the SAME PaymentIntent instead of minting
    // new ones — a tenant can never be charged twice for one booking.
    pi = await stripeClient().paymentIntents.create({
      amount: Number(bk.total_minor),
      currency: 'gnf',
      automatic_payment_methods: { enabled: true },
      metadata: { kind: 'booking', booking_id: bk.id, user_id: tenantId },
    }, { idempotencyKey: `booking-pi-${bk.id}` });
    if (!pi.client_secret) throw new Error('missing client_secret');
  } catch (e) {
    console.error('[booking-sign-pay] stripe init error:', e);
    throwApi('INTERNAL_ERROR', 500, 'Erreur initialisation du paiement');
  }

  // Stamp the tenant's signature (they held-to-sign before the payment sheet)
  // + keep the PI reference for support/troubleshooting.
  await sb.from('bookings').update({
    tenant_signed_at: new Date().toISOString(),
    stripe_pi_id: pi.id,
    updated_at: new Date().toISOString(),
  }).eq('id', bk.id);

  return {
    body: {
      booking_id: bk.id,
      client_secret: pi.client_secret,
      publishable_key: stripePublishableKey(),
    },
  };
}));
