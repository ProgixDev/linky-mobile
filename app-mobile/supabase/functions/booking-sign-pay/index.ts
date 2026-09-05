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
import { initPayment, LENGOPAY_MAX_AMOUNT_MINOR } from '@shared/lengopay.ts';
import { formatGNF } from '@shared/push.ts';
import { stripeClient, stripeConfigured, stripePublishableKey } from '@shared/stripe.ts';

interface Body {
  booking_id: string;
  /** Optional: the mobile-money number for reference. Falls back to primary phone. */
  payer_phone?: string;
  /** 'card' = Stripe (profils etranger) ; sinon page hebergee Lengopay.
   *  Absent = lengopay, pour que les installations anterieures continuent de
   *  fonctionner exactement comme avant. */
  payment_method?: 'card' | 'orange-money' | 'mtn-money';
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PHONE_RE = /^\+224\d{9}$/;
const METHODS = ['card', 'orange-money', 'mtn-money'];

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.booking_id !== 'string' || !UUID_RE.test(x.booking_id)) return false;
  if (x.payer_phone !== undefined && (typeof x.payer_phone !== 'string' || !PHONE_RE.test(x.payer_phone))) return false;
  if (x.payment_method !== undefined
      && (typeof x.payment_method !== 'string' || !METHODS.includes(x.payment_method))) return false;
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

  const method = body.payment_method ?? 'orange-money';

  // ── RAIL CARTE (Stripe) — profils a l'etranger ────────────────────────────
  // Client 2026-09-04 : « l'appli me demande de saisir un numero de telephone
  // avant de payer et signer le contrat », alors qu'un payeur de la diaspora
  // n'a par definition PAS de numero guineen. C'etait le seul chemin possible :
  // la reservation etait cablee en dur sur Lengopay. Le numero n'est donc plus
  // exige que la ou il sert vraiment, le rail mobile money.
  //
  // Le reglement existe DEJA cote webhook : stripe-webhook traite
  // metadata.kind==='booking' (verification du montant/devise, idempotence,
  // duplicata) et appelle confirm_booking_payment. Rien a construire de ce
  // cote — il n'y avait simplement aucun emetteur.
  if (method === 'card') {
    if (!stripeConfigured()) {
      throwApi('STRIPE_NOT_CONFIGURED', 503, 'Le paiement par carte arrive bientôt.');
    }
    // GNF-only, meme garde que place-order : le montant est envoye tel quel en
    // 'gnf' (zero-decimale). Un montant EUR facture en GNF serait une erreur
    // silencieuse d'un facteur ~9000.
    if (bk.currency !== 'GNF') {
      console.error('[booking-sign-pay] card branch refused non-GNF booking', { booking_id: bk.id, currency: bk.currency });
      throwApi('CURRENCY_NOT_SUPPORTED', 400, 'Devise non supportée pour la carte.');
    }

    const cardPlaceholder = `pending-init-${crypto.randomUUID()}`;
    const { data: cardIntent, error: cardIntentErr } = await sb
      .from('payment_intents')
      .insert({
        booking_id:     bk.id,
        rail:           'stripe',
        rail_intent_id: cardPlaceholder,
        method:         'card',
        currency:       bk.currency,
        amount_minor:   bk.total_minor,
        payer_phone:    null,
      })
      .select('id')
      .single();
    if (cardIntentErr || !cardIntent) {
      console.error('[booking-sign-pay] stripe intent insert error:', cardIntentErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur intent de paiement');
    }

    let stripeIntent;
    try {
      stripeIntent = await stripeClient().paymentIntents.create({
        amount: Number(bk.total_minor),
        currency: 'gnf',
        automatic_payment_methods: { enabled: true },
        // kind='booking' est ce que stripe-webhook attend pour router vers
        // confirm_booking_payment plutot que vers le RPC des commandes.
        metadata: { kind: 'booking', booking_id: bk.id, intent_id: cardIntent.id, user_id: tenantId },
      });
      if (!stripeIntent.client_secret) throw new Error('missing client_secret');
    } catch (e) {
      console.error('[booking-sign-pay] stripe init error:', e);
      await sb.rpc('process_booking_intent_outcome', {
        p_intent_id: cardIntent.id, p_terminal_status: 'failed', p_rail_status: 'init_failed',
        p_error_code: 'RAIL_INIT_FAILED', p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
      });
      throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
    }

    const { error: cardUpdErr } = await sb
      .from('payment_intents')
      .update({ rail_intent_id: stripeIntent.id, rail_status: stripeIntent.status, updated_at: new Date().toISOString() })
      .eq('id', cardIntent.id);
    if (cardUpdErr) {
      console.error('[booking-sign-pay] CRITICAL stripe intent UPDATE failed post-init', {
        intent_id: cardIntent.id, stripe_pi: stripeIntent.id, error: cardUpdErr,
      });
      await sb.rpc('process_booking_intent_outcome', {
        p_intent_id: cardIntent.id, p_terminal_status: 'failed', p_rail_status: stripeIntent.status,
        p_error_code: 'INTENT_UPDATE_FAILED', p_error_message: `pi=${stripeIntent.id} ${cardUpdErr.message}`.slice(0, 500),
      });
      throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement intent');
    }

    return {
      body: {
        booking_id: bk.id,
        payment: { client_secret: stripeIntent.client_secret, publishable_key: stripePublishableKey() },
      },
    };
  }

  // ── RAIL LENGOPAY (page hebergee : carte, wallet, mobile money) ───────────
  // Payer phone (reference on the intent) — body override, else primary phone.
  let payerPhone = body.payer_phone;
  if (!payerPhone) {
    const { data: phoneRow } = await sb
      .from('phones').select('e164').eq('user_id', tenantId).eq('is_primary', true).maybeSingle();
    payerPhone = phoneRow?.e164 ?? undefined;
  }
  if (!payerPhone) throwApi('PAYER_PHONE_REQUIRED', 400, 'Numéro de paiement requis');

  // Plafond Lengopay (25/08, cf. lengopay.ts). La reservation reste 'accepted'
  // (aucune intention creee encore) — le locataire peut reessayer.
  if (Number(bk.total_minor) > LENGOPAY_MAX_AMOUNT_MINOR) {
    throwApi('LENGOPAY_AMOUNT_LIMIT', 400,
      `Ce montant (${formatGNF(Number(bk.total_minor))}) dépasse le plafond autorisé pour Orange Money/MTN (${formatGNF(LENGOPAY_MAX_AMOUNT_MINOR)}). Merci de nous contacter pour un autre moyen de paiement.`);
  }

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

  // AUCUNE signature n'est apposee ici. Client 2026-08-22 : « il faut faire la
  // signature APRES le paiement du client, pas avant ».
  //
  // Ce que faisait le code d'avant : il tamponnait tenant_signed_at au moment
  // ou la page de paiement s'OUVRAIT. Un locataire qui refermait la page sans
  // payer laissait donc un contrat portant sa signature et aucun paiement —
  // exactement ce que le client a vu a l'ecran (« Signature locataire
  // ✔ 21/08/2026 » sous « en attente du paiement »). Un contrat signe engage ;
  // il ne doit pas exister avant que l'argent soit reellement encaisse.
  //
  // La signature est desormais posee par confirm_booking_payment, qui fait deja
  // `tenant_signed_at = coalesce(tenant_signed_at, now())` a la confirmation du
  // paiement (migration 20260707_02). Aucune migration necessaire : il suffisait
  // de retirer le tampon anticipe.
  return { body: { booking_id: bk.id, payment_url: initResp.payment_url } };
}));
