// Tenant signs the contract (hold-to-confirm client-side) and pays via the
// Orange/MTN (Lengopay) hosted page — the SAME rail product orders use. (Was
// Stripe, dropped in Guinea → payments always failed; client 2026-07-29.)
//
// S2 orphan-safe ordering, mirrors place-order's lengopay branch:
//   1. insert payment_intents (booking_id, placeholder rail_intent_id)
//   2. Lengopay init → payment_url
//   3. update intent with the real pay_id
//   On init/update failure: process_booking_intent_outcome(failed) — the booking
//   stays 'accepted' so the tenant can retry. The cron (cron-poll-intents,
//   booking step) polls the pay_id and calls confirm_booking_payment on success
//   (one-sided escrow credit + accepted→paid).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { initPayment } from '@shared/lengopay.ts';

interface Body {
  booking_id: string;
  /** Optional: the mobile-money number for reference. Falls back to primary phone. */
  payer_phone?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PHONE_RE = /^\+224\d{9}$/;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.booking_id !== 'string' || !UUID_RE.test(x.booking_id)) return false;
  if (x.payer_phone !== undefined && (typeof x.payer_phone !== 'string' || !PHONE_RE.test(x.payer_phone))) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/bookings/sign-pay', valid, async ({ sb, body, req }) => {
  const tenantId = await requireUser(req);

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

  // Payer phone (reference on the intent) — body override, else primary phone.
  let payerPhone = body.payer_phone;
  if (!payerPhone) {
    const { data: phoneRow } = await sb
      .from('phones').select('e164').eq('user_id', tenantId).eq('is_primary', true).maybeSingle();
    payerPhone = phoneRow?.e164 ?? undefined;
  }
  if (!payerPhone) throwApi('PAYER_PHONE_REQUIRED', 400, 'Numéro de paiement requis');

  // S2 step 1: intent FIRST with a unique placeholder rail_intent_id.
  const placeholderId = `pending-init-${crypto.randomUUID()}`;
  const { data: intentRow, error: intentErr } = await sb
    .from('payment_intents')
    .insert({
      booking_id:     bk.id,
      rail:           'lengopay',
      rail_intent_id: placeholderId,
      method:         'orange-money', // hosted page lets the tenant pick Orange/MTN
      currency:       bk.currency,
      amount_minor:   bk.total_minor,
      payer_phone:    payerPhone,
    })
    .select('id')
    .single();
  if (intentErr || !intentRow) {
    console.error('[booking-sign-pay] intent insert error:', intentErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur intent de paiement');
  }

  // S2 step 2: Lengopay init (hosted-page flow — payer picks Orange/MTN there).
  let initResp;
  try {
    initResp = await initPayment({
      amount_minor: Number(bk.total_minor),
      currency:     bk.currency as 'GNF' | 'EUR',
    });
  } catch (e) {
    console.error('[booking-sign-pay] lengopay init error:', e);
    await sb.rpc('process_booking_intent_outcome', {
      p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: 'init_failed',
      p_error_code: 'RAIL_INIT_FAILED', p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
    });
    throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
  }

  // S2 step 3: UPDATE intent with the real pay_id from Lengopay.
  const { error: updErr } = await sb
    .from('payment_intents')
    .update({ rail_intent_id: initResp.pay_id, rail_status: initResp.status, updated_at: new Date().toISOString() })
    .eq('id', intentRow.id);
  if (updErr) {
    console.error('[booking-sign-pay] CRITICAL intent UPDATE failed post-init', { intent_id: intentRow.id, pay_id: initResp.pay_id, error: updErr });
    await sb.rpc('process_booking_intent_outcome', {
      p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: initResp.status,
      p_error_code: 'INTENT_UPDATE_FAILED', p_error_message: `pay_id=${initResp.pay_id} ${updErr.message}`.slice(0, 500),
    });
    throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement intent');
  }

  // Stamp the tenant's signature (they held-to-sign before opening the page).
  await sb.from('bookings').update({
    tenant_signed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', bk.id);

  return { body: { booking_id: bk.id, payment_url: initResp.payment_url } };
}));
