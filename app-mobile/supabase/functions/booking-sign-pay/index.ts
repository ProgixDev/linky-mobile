// Tenant signs the contract (hold-to-confirm client-side) and pays via
// Orange/MTN through Lengopay v2, in-app (2026-09-05 — no more hosted page;
// was Stripe before that, dropped in Guinea → payments always failed;
// client 2026-07-29).
//
// S2 orphan-safe ordering, mirrors place-order's lengopay branch:
//   1. insert payment_intents (booking_id, placeholder rail_intent_id)
//   2. Lengopay v2 init (tenant's number goes straight in, no payment_url)
//   3. update intent with the real pay_id
//   On init/update failure: process_booking_intent_outcome(failed) — the booking
//   stays 'accepted' so the tenant can retry. The cron (cron-poll-intents,
//   booking step) polls the pay_id and calls confirm_booking_payment on success
//   (one-sided escrow credit + accepted→paid).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import {
  initForRail, toLocalGnAccount, LENGOPAY_MAX_AMOUNT_MINOR, isGnE164,
  LENGOPAY_RAILS, railIsDeadEnd, railActionUrl, RAIL_NO_ACTION_MESSAGE,
  railNeedsCard, LengopayRefused, railPhoneMessage, intentIsLive,
  type LengopayMethod,
} from '@shared/lengopay.ts';
import { formatGNF } from '@shared/push.ts';
import { stripeClient, stripeConfigured, stripePublishableKey } from '@shared/stripe.ts';

interface Body {
  booking_id: string;
  /** Optional: the mobile-money number for reference. Falls back to primary phone. */
  payer_phone?: string;
  /** PayCard : numero de compte de la carte prepayee. Jamais persiste — il ne
   *  sert qu'a l'appel d'initialisation chez Lengopay. */
  payer_card?: string;
  /** 'card' = Stripe (profils etranger) ; les autres = rails Lengopay.
   *  Absent = orange-money, pour que les installations anterieures continuent
   *  de fonctionner exactement comme avant. */
  payment_method?: 'card' | 'orange-money' | 'mtn-money'
                 | 'kulu' | 'soutramoney' | 'lengopay-card' | 'paycard';
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PHONE_RE = /^\+224\d{9}$/;
const CARD_RE = /^[0-9 -]{6,32}$/;
// 'kulu' rouvert le 2026-09-07 avec la phase 3 : l'ecran de saisie du code
// (app/checkout/otp.tsx) et lengopay-confirm-otp existent desormais, donc
// un paiement Kulu peut etre TERMINE. Il etait bloque ici entre-temps.
const METHODS = [
  'card', 'orange-money', 'mtn-money',
  'kulu', 'soutramoney', 'lengopay-card', 'paycard',
];

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.booking_id !== 'string' || !UUID_RE.test(x.booking_id)) return false;
  if (x.payer_phone !== undefined && (typeof x.payer_phone !== 'string' || !PHONE_RE.test(x.payer_phone))) return false;
  if (x.payer_card !== undefined) {
    if (typeof x.payer_card !== 'string' || !CARD_RE.test(x.payer_card.trim())) return false;
  }
  if (x.payment_method !== undefined
      && (typeof x.payment_method !== 'string' || !METHODS.includes(x.payment_method))) return false;
  return true;
}

// Filtre du cache d'idempotence (contrat de wrap.ts, meme idee que dans
// place-order) : le client_secret Stripe ne doit PAS rester dans
// idempotency_keys.response_body pendant 24 h — une lecture service_role
// rejouerait un identifiant de paiement encore vivant. Un appel idempotent
// rejoue recoit la reponse sans le bloc `payment` ; la reponse initiale, elle,
// n'est pas affectee.
function stripPaymentSecret(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const { payment: _payment, ...rest } = body as Record<string, unknown>;
  return rest;
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

  // ── UN SEUL PAIEMENT VIVANT A LA FOIS ─────────────────────────────────────
  // Sans cette garde, rappeler cet endpoint pendant qu'une intention est encore
  // 'pending' en ouvrait une SECONDE chez Lengopay pour la meme reservation.
  // Rien ne l'empechait : les unicites de payment_intents portent sur
  // (rail, rail_intent_id) et (order_id, attempt_index), et order_id est NULL
  // pour une reservation.
  //
  // Le scenario coute de l'argent au locataire. Il choisit Soutra Money, ferme
  // la page sans payer, revient — la reservation est toujours 'accepted', donc
  // le bouton « Signer & payer » est toujours la — et retape. Deux paiements
  // vivants. S'il regle les deux (la premiere page est encore ouverte chez
  // Soutra), le cron confirme le premier, puis confirm_booking_payment rend
  // 'noop' sur le second parce que la reservation n'est plus 'accepted' —
  // et process_booking_intent_outcome ne journalise que 'conflict'/'unknown'.
  // Resultat : debite deux fois, sequestre credite une fois, aucune trace.
  //
  // On rend donc l'intention EN COURS au lieu d'en creer une autre. Meme moyen :
  // le locataire retrouve sa page. Moyen different : on refuse, parce qu'on ne
  // peut pas annuler proprement chez Lengopay (leur API n'a pas d'annulation) et
  // que fermer notre ligne pendant qu'il peut encore payer creerait exactement
  // le trou qu'on vient de decrire, dans l'autre sens.
  // La borne d'age n'est pas cosmetique : sans elle, une intention 'pending'
  // que plus rien ne peut expirer (un dernier sondage en erreur — voir
  // INTENT_TTL_MS) bloquerait cette reservation POUR TOUJOURS. On ne se montre
  // pas plus strict que les balayages : passe 15 minutes, l'intention est morte
  // pour tout le monde.
  const { data: livePi } = await sb
    .from('payment_intents')
    .select('id, method, rail_intent_id, rail_action_url, created_at')
    .eq('booking_id', bk.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (livePi && intentIsLive(livePi.created_at) && !String(livePi.rail_intent_id).startsWith('pending-init-')) {
    if (livePi.method !== method) {
      throwApi('PAYMENT_IN_PROGRESS', 409,
        'Un paiement est déjà en cours pour cette réservation. Termine-le, ou attends 15 minutes avant de changer de moyen.');
    }
    return {
      body: {
        booking_id: bk.id,
          // Kulu : rendre {kind:'poll'} priverait l'acheteur de l'ecran ou
          // saisir son code — il attendrait 15 min pour rien. On rejoue donc
          // l'etape reelle du rail, pas seulement sa page.
          // Kulu ET la carte guineenne. Pour cette derniere, la deduction tient
          // a railIsDeadEnd : un rail sans numero qui rend 'poll' est ferme des
          // l'init. Une intention 'lengopay-card' ENCORE VIVANTE et sans page a
          // donc forcement rendu un code — sinon elle n'existerait plus.
        next_step: livePi.rail_action_url
          ? { kind: 'webview', url: livePi.rail_action_url }
          // paycard rejoint la liste : elle aussi se conclut par un code, et une
          // intention vivante sans page ne peut etre que dans cet etat.
          : (livePi.method === 'kulu' || livePi.method === 'lengopay-card'
             || livePi.method === 'paycard')
            ? { kind: 'otp', payId: livePi.rail_intent_id }
            : { kind: 'poll' },
      },
    };
  }

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

    // AUCUNE ligne payment_intents pour ce rail, DELIBEREMENT.
    //
    // Le reglement carte d'une reservation ne passe pas par les intentions :
    // stripe-webhook lit metadata.kind='booking' et appelle directement
    // confirm_booking_payment — son propre commentaire dit qu'il est ecrit pour
    // un monde « sans ligne payment_intents ». En ajouter une creait une
    // orpheline que PERSONNE ne reglait : pick_stale_stripe_intents l'exclut
    // desormais, pick_booking_intents_to_poll et expire_stale_booking_intents
    // exigent rail='lengopay', et le webhook rend la main avant de la lire.
    // Elle serait restee 'pending' pour toujours.
    //
    // Ce qui tient lieu de suivi, c'est bookings.stripe_pi_id — et il porte
    // TROIS garde-fous qu'il ne faut pas laisser tomber :
    //   * pick_stale_booking_pis (20260707_03) annule chez Stripe une PI
    //     abandonnee au bout de 24 h — mais seulement `where stripe_pi_id is
    //     not null` ;
    //   * expire_stale_bookings (20260711_01) n'annule une reservation en
    //     souffrance que `where stripe_pi_id is null`, c'est-a-dire jamais
    //     quand de l'argent est en vol ;
    //   * delete-account refuse de purger une reservation dont la PI vit
    //     encore (`.is('stripe_pi_id', null)`).
    // Sans ce tampon, les trois se desactivent en silence.
    let stripeIntent;
    try {
      stripeIntent = await stripeClient().paymentIntents.create(
        {
          amount: Number(bk.total_minor),
          currency: 'gnf',
          automatic_payment_methods: { enabled: true },
          // kind='booking' est ce que stripe-webhook attend pour router vers
          // confirm_booking_payment plutot que vers le RPC des commandes.
          metadata: { kind: 'booking', booking_id: bk.id, user_id: tenantId },
        },
        // Cle d'idempotence derivee de la reservation (garde anti-double-debit,
        // DEFECT-2 de la revue du 2026-07-06). Deux appuis successifs sur
        // « payer » — le cas est reel, la reservation reste 'accepted' le temps
        // que le webhook arrive — renvoient la MEME PaymentIntent au lieu d'en
        // creer une seconde et de debiter deux fois.
        { idempotencyKey: `booking-pi-${bk.id}` },
      );
      if (!stripeIntent.client_secret) throw new Error('missing client_secret');
    } catch (e) {
      console.error('[booking-sign-pay] stripe init error:', e);
      throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
    }

    const { error: stampErr } = await sb
      .from('bookings')
      .update({ stripe_pi_id: stripeIntent.id, updated_at: new Date().toISOString() })
      .eq('id', bk.id)
      .eq('status', 'accepted');
    if (stampErr) {
      // Sans le tampon, les trois garde-fous ci-dessus sont aveugles a une PI
      // pourtant vivante. On refuse plutot que de rendre un client_secret
      // qu'on ne saurait plus suivre ; l'idempotence fait que reessayer
      // retombera sur la MEME PI, donc rien n'est perdu.
      console.error('[booking-sign-pay] CRITICAL stripe_pi_id stamp failed', {
        booking_id: bk.id, stripe_pi: stripeIntent.id, stampErr,
      });
      throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement du paiement');
    }

    return {
      body: {
        booking_id: bk.id,
        payment: { client_secret: stripeIntent.client_secret, publishable_key: stripePublishableKey() },
      },
    };
  }

  // ── RAILS LENGOPAY v2 (in-app, plus de page hebergee) ─────────────────────
  const lengoMethod = method as LengopayMethod;
  const rail = LENGOPAY_RAILS[lengoMethod];

  // PayCard exige un numero de carte EN PLUS du telephone. Refuse ici, avant le
  // moindre appel reseau : rien n'est encore engage.
  const payerCard = body.payer_card?.trim();
  if (railNeedsCard(lengoMethod) && !payerCard) {
    throwApi('CARD_NUMBER_REQUIRED', 400, 'Saisis ton numéro de compte PayCard.');
  }

  // Payer phone (reference on the intent) — body override, else primary phone.
  // Seuls les rails qui encaissent sur un numero en reclament un.
  let payerPhone: string | undefined;
  if (rail.needsAccount) {
    payerPhone = body.payer_phone;
    if (!payerPhone) {
      const { data: phoneRow } = await sb
        .from('phones').select('e164').eq('user_id', tenantId).eq('is_primary', true).maybeSingle();
      payerPhone = phoneRow?.e164 ?? undefined;
    }
    if (!payerPhone) throwApi('PAYER_PHONE_REQUIRED', 400, 'Numéro de paiement requis');
    if (!isGnE164(payerPhone)) throwApi('PAYER_PHONE_INVALID', 400, railPhoneMessage(lengoMethod));
  }

  // Plafond Lengopay (25/08, cf. lengopay.ts). La reservation reste 'accepted'
  // (aucune intention creee encore) — le locataire peut reessayer.
  if (Number(bk.total_minor) > LENGOPAY_MAX_AMOUNT_MINOR) {
    throwApi('LENGOPAY_AMOUNT_LIMIT', 400,
      `Ce montant (${formatGNF(Number(bk.total_minor))}) dépasse le plafond autorisé pour ${rail.label} (${formatGNF(LENGOPAY_MAX_AMOUNT_MINOR)}). Merci de nous contacter pour un autre moyen de paiement.`);
  }

  // S2 step 1: intent FIRST with a unique placeholder rail_intent_id.
  const placeholderId = `pending-init-${crypto.randomUUID()}`;
  const { data: intentRow, error: intentErr } = await sb
    .from('payment_intents')
    .insert({
      booking_id:     bk.id,
      rail:           'lengopay',
      rail_intent_id: placeholderId,
      // v2 needs to know which rail up front (no hosted page to pick on
      // anymore) — 'method' est deja narrow a un rail Lengopay ici.
      method,
      currency:       bk.currency,
      amount_minor:   bk.total_minor,
      payer_phone:    payerPhone ?? null,
    })
    .select('id')
    .single();
  if (intentErr || !intentRow) {
    console.error('[booking-sign-pay] intent insert error:', intentErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur intent de paiement');
  }

  // S2 step 2: Lengopay v2 init — in-app, the tenant's number goes straight in.
  let initResp;
  try {
    initResp = await initForRail(lengoMethod, {
      amount_minor: Number(bk.total_minor),
      currency:     bk.currency as 'GNF' | 'EUR',
      ...(payerPhone ? { account: toLocalGnAccount(payerPhone) } : {}),
      ...(payerCard ? { card: payerCard } : {}),
    });
  } catch (e) {
    console.error('[booking-sign-pay] lengopay init error:', e);
    await sb.rpc('process_booking_intent_outcome', {
      p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: 'init_failed',
      p_error_code: 'RAIL_INIT_FAILED', p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
    });
    // Refus METIER : le message du fournisseur nomme ce qui bloque, et le
    // locataire peut le corriger.
    if (e instanceof LengopayRefused) throwApi('RAIL_REFUSED', 400, e.message);
    throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
  }

  const nextStep = initResp.step;

  // Impasse : rail sans numero et sans page — voir railIsDeadEnd. La
  // reservation reste 'accepted', donc le locataire peut reessayer avec un
  // autre moyen ; aucune signature n'a ete posee (elle vient du paiement).
  if (railIsDeadEnd(lengoMethod, nextStep)) {
    console.error('[booking-sign-pay] rail sans action exploitable', {
      method: lengoMethod, pay_id: initResp.payId, booking_id: bk.id,
    });
    await sb.rpc('process_booking_intent_outcome', {
      p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: 'no_action',
      p_error_code: 'RAIL_NO_ACTION',
      p_error_message: `pay_id=${initResp.payId} method=${lengoMethod}`,
    });
    throwApi('RAIL_NO_ACTION', 502, RAIL_NO_ACTION_MESSAGE);
  }

  // S2 step 3: UPDATE intent with the real pay_id from Lengopay.
  const { error: updErr } = await sb
    .from('payment_intents')
    .update({
      rail_intent_id:  initResp.payId,
      rail_status:     'pending',
      rail_action_url: railActionUrl(nextStep),
      // PayCard : l'etat a repasser tel quel a la finalisation, ecrit dans le
      // MEME UPDATE que le pay_id.
      ...(initResp.context ? { rail_context: initResp.context } : {}),
      updated_at:      new Date().toISOString(),
    })
    .eq('id', intentRow.id);
  if (updErr) {
    console.error('[booking-sign-pay] CRITICAL intent UPDATE failed post-init', { intent_id: intentRow.id, pay_id: initResp.payId, error: updErr });
    await sb.rpc('process_booking_intent_outcome', {
      p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: 'pending',
      p_error_code: 'INTENT_UPDATE_FAILED', p_error_message: `pay_id=${initResp.payId} ${updErr.message}`.slice(0, 500),
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
  // next_step : sonder (Orange/MTN), ouvrir la page (Soutra Money) ou saisir un
  // code (Kulu).
  return { body: { booking_id: bk.id, next_step: nextStep } };
}, stripPaymentSecret));
