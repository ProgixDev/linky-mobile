// Buy a boost for one of the caller's listings — a product (Boutique) OR a
// property (Immobilier). All the money + validation logic lives in the
// purchase_boost / purchase_property_boost RPCs (one transaction: ownership
// check under a row lock → seller→platform transfer → boost row → listing
// flag), so this endpoint just resolves the server-side price and maps DB
// errors to French envelopes. The client sends only { product_id | property_id,
// days } — never a price.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapBoost, type BoostRow } from '@shared/catalog.ts';
import { boostPrice } from '@shared/boost.ts';
import {
  initPaymentV2, toLocalGnAccount, isGnE164,
  LENGOPAY_RAILS, railNextStep, railIsDeadEnd, railActionUrl, RAIL_NO_ACTION_MESSAGE, intentIsLive,
  type LengopayMethod,
} from '@shared/lengopay.ts';
import { stripeClient, stripeConfigured, stripePublishableKey } from '@shared/stripe.ts';

interface Body {
  product_id?: string;
  property_id?: string;
  days: number;
  /** Défaut 'wallet' — c'était le seul rail avant le 2026-08-12, et les anciennes
   *  versions de l'app n'envoient pas ce champ. 'card' (Stripe) et les rails
   *  Lengopay guinéens ajoutés le 2026-09-07 (client : « Pareil pour le boost
   *  aussi. Unifier les méthodes de paiement dans l'appli »). */
  method?: 'wallet' | 'orange-money' | 'mtn-money' | 'card'
         | 'kulu' | 'soutramoney' | 'lengopay-card';
  payer_phone?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
// 'kulu' rouvert le 2026-09-07 avec la phase 3 : l'ecran de saisie du code
// (app/checkout/otp.tsx) et lengopay-confirm-otp existent desormais, donc
// un paiement Kulu peut etre TERMINE. Il etait bloque ici entre-temps.
const METHODS = [
  'wallet', 'orange-money', 'mtn-money', 'card',
  'kulu', 'soutramoney', 'lengopay-card',
];

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.days !== 'number' || !Number.isInteger(x.days)) return false;
  if (x.method !== undefined && (typeof x.method !== 'string' || !METHODS.includes(x.method))) return false;
  if (x.payer_phone !== undefined && typeof x.payer_phone !== 'string') return false;
  const hasProduct = typeof x.product_id === 'string' && UUID_RE.test(x.product_id);
  const hasProperty = typeof x.property_id === 'string' && UUID_RE.test(x.property_id);
  // exactly one target (XOR)
  return hasProduct !== hasProperty;
}

/** Traduction des exceptions des RPC de boost en enveloppes francaises. Partagee
 *  par les deux rails : les gardes de propriete/annonce active sont les memes
 *  des deux cotes, donc leurs messages doivent l'etre aussi. */
function throwBoostError(msg: string, where: string, error: unknown): never {
  if (msg.includes('INSUFFICIENT_FUNDS')) {
    // La recharge du portefeuille est desactivee (WALLET_TOPUP_ENABLED=false) :
    // conseiller de recharger envoyait le vendeur vers un ecran inatteignable.
    throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant. Paie par Orange Money, MTN ou carte bancaire.');
  }
  if (msg.includes('PRODUCT_NOT_FOUND') || msg.includes('PROPERTY_NOT_FOUND')) {
    throwApi('NOT_FOUND', 404, 'Annonce introuvable.');
  }
  if (msg.includes('NOT_OWNER')) throwApi('FORBIDDEN', 403, "Cette annonce ne t'appartient pas.");
  if (msg.includes('PRODUCT_NOT_ACTIVE') || msg.includes('PROPERTY_NOT_ACTIVE')) {
    throwApi('LISTING_NOT_ACTIVE', 400, 'Seule une annonce active peut être boostée.');
  }
  if (msg.includes('SELLER_WALLET_NOT_FOUND')) {
    throwApi('WALLET_NOT_FOUND', 400, 'Ouvre ton portefeuille avant de booster.');
  }
  console.error(`[create-boost] ${where}:`, error);
  throwApi('INTERNAL_ERROR', 500, 'Erreur lors du boost.');
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

Deno.serve(makePost<Body>('/v1/boosts/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const amount = boostPrice(body.days);
  if (amount === undefined) {
    throwApi('INVALID_TIER', 400, 'Durée de boost invalide.');
  }

  const isProperty = typeof body.property_id === 'string';
  const method = body.method ?? 'wallet';

  // Refuser AVANT de reserver le boost : un secret manquant ne doit pas laisser
  // une ligne 'pending_payment' que rien ne viendrait regler. Meme garde que
  // place-order et booking-sign-pay.
  if (method === 'card' && !stripeConfigured()) {
    throwApi('STRIPE_NOT_CONFIGURED', 503, 'Le paiement par carte arrive bientôt.');
  }

  // ─── Rail CARTE (Stripe) ──────────────────────────────────────────────────
  // AUCUNE ligne payment_intents, DELIBEREMENT — voir l'en-tete de la migration
  // 20260907_01 : elle serait orpheline (aucun balayage ne la ramasse, le
  // webhook ne sait router qu'entre commande et lot) et resterait 'pending'
  // pour toujours. Le suivi passe par boosts.stripe_pi_id, exactement comme
  // bookings.stripe_pi_id, et le reglement par metadata.kind='boost'.
  if (method === 'card') {
    const { data: boostId, error: pendErr } = await sb.rpc('create_pending_boost', {
      p_product_id:   body.product_id ?? null,
      p_property_id:  body.property_id ?? null,
      p_seller_id:    userId,
      p_days:         body.days,
      p_amount_minor: amount,
    });
    if (pendErr || !boostId) {
      throwBoostError((pendErr as { message?: string })?.message ?? '', 'create_pending_boost', pendErr);
    }

    let stripeIntent;
    try {
      stripeIntent = await stripeClient().paymentIntents.create(
        {
          amount: Number(amount),
          currency: 'gnf',
          automatic_payment_methods: { enabled: true },
          // kind='boost' est ce que stripe-webhook attend pour router vers
          // confirm_boost_payment plutot que vers le RPC des commandes.
          metadata: { kind: 'boost', boost_id: boostId, user_id: userId },
        },
        // Cle d'idempotence derivee du boost : deux appuis successifs sur
        // « payer » renvoient la MEME PaymentIntent au lieu d'en creer une
        // seconde et de debiter deux fois (meme garde que booking-pi-<id>).
        { idempotencyKey: `boost-pi-${boostId}` },
      );
      if (!stripeIntent.client_secret) throw new Error('missing client_secret');
    } catch (e) {
      console.error('[create-boost] stripe init error:', e);
      // Le boost reserve n'a plus de chemin de reglement : on l'annule tout de
      // suite plutot que de le laisser en 'pending_payment' indefiniment.
      await sb.from('boosts').update({ status: 'cancelled' }).eq('id', boostId);
      throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
    }

    const { error: stampErr } = await sb
      .from('boosts')
      .update({ stripe_pi_id: stripeIntent.id })
      .eq('id', boostId)
      .eq('status', 'pending_payment');
    if (stampErr) {
      // Sans le tampon, le balayage des PI abandonnees est aveugle a une PI
      // pourtant vivante. On refuse plutot que de rendre un client_secret qu'on
      // ne saurait plus suivre ; l'idempotence fait qu'un reessai retombera sur
      // la MEME PI, donc rien n'est perdu.
      console.error('[create-boost] CRITICAL stripe_pi_id stamp failed', {
        boost_id: boostId, stripe_pi: stripeIntent.id, stampErr,
      });
      throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement du paiement');
    }

    return {
      body: {
        boost_id: boostId,
        payment: { client_secret: stripeIntent.client_secret, publishable_key: stripePublishableKey() },
      },
    };
  }

  // ─── Rail mobile money ────────────────────────────────────────────────────
  // L'argent n'existe pas encore : on reserve le boost en 'pending_payment' (il
  // ne remonte pas l'annonce), on ouvre l'intention, et c'est le cron qui
  // activera au retour de Lengopay. Meme sequence que booking-sign-pay :
  // intention AVANT l'appel au rail, avec un rail_intent_id provisoire, pour
  // qu'aucun paiement ne puisse exister sans ligne en base.
  if (method !== 'wallet') {
    const lengoMethod = method as LengopayMethod;
    const rail = LENGOPAY_RAILS[lengoMethod];

    // Seuls les rails qui encaissent sur un numero en reclament un (Soutra
    // Money et la carte identifient le vendeur sur leur propre page).
    let payerPhone: string | undefined;
    if (rail.needsAccount) {
      payerPhone = body.payer_phone?.trim();
      if (!payerPhone) {
        const { data: phoneRow } = await sb
          .from('phones').select('e164').eq('user_id', userId).eq('is_primary', true).maybeSingle();
        payerPhone = phoneRow?.e164 ?? undefined;
      }
      if (!payerPhone) throwApi('PAYER_PHONE_REQUIRED', 400, 'Numéro de paiement requis');
      if (!isGnE164(payerPhone)) throwApi('PAYER_PHONE_INVALID', 400, `Indique le numéro ${rail.label} qui paie (9 chiffres, commence par 6).`);
    }

    // ── UN SEUL PAIEMENT VIVANT PAR ANNONCE ─────────────────────────────────
    // create_pending_boost fabrique un boost NEUF a chaque appel. Sans cette
    // garde, un vendeur qui ferme la page Soutra Money sans payer et retape
    // « Payer » ouvre un SECOND paiement vivant pour la meme annonce ; s'il
    // regle les deux (la premiere page est encore ouverte), il paie deux fois.
    // On lui rend donc le paiement deja en cours au lieu d'en creer un autre.
    // Moyen different : on refuse, faute de pouvoir annuler chez Lengopay.
    const targetCol = body.property_id ? 'property_id' : 'product_id';
    const targetId = body.property_id ?? body.product_id;
    // La borne d'age n'est pas cosmetique : sans elle, une intention 'pending'
    // que plus rien ne peut expirer (un dernier sondage en erreur — voir
    // INTENT_TTL_MS) rendrait cette annonce impossible a booster POUR TOUJOURS,
    // et aucun balayage ne ramasse un boost 'pending_payment'.
    const { data: liveBoost } = await sb
      .from('boosts')
      .select('id, days, payment_intents!inner ( id, method, rail_intent_id, rail_action_url, status, created_at )')
      .eq('seller_id', userId)
      .eq(targetCol, targetId)
      .eq('status', 'pending_payment')
      .eq('payment_intents.status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const livePi = (liveBoost?.payment_intents as
      { method: string; rail_intent_id: string; rail_action_url: string | null; created_at: string }[] | undefined)?.[0];
    if (liveBoost && livePi && intentIsLive(livePi.created_at) && !String(livePi.rail_intent_id).startsWith('pending-init-')) {
      // La DUREE compte autant que le moyen : rendre le paiement en cours alors
      // que le vendeur vient d'en choisir une autre lui facturerait l'ancien
      // tarif pour la nouvelle duree affichee a l'ecran.
      if (livePi.method !== method || liveBoost.days !== body.days) {
        throwApi('PAYMENT_IN_PROGRESS', 409,
          'Un paiement est déjà en cours pour cette annonce. Termine-le, ou attends 15 minutes avant de changer de formule.');
      }
      return {
        body: {
          boost_id: liveBoost.id,
            // Kulu : rendre {kind:'poll'} priverait l'acheteur de l'ecran ou
            // saisir son code — il attendrait 15 min pour rien. On rejoue donc
            // l'etape reelle du rail, pas seulement sa page.
            // Kulu ET la carte guineenne. Pour cette derniere, la deduction tient
            // a railIsDeadEnd : un rail sans numero qui rend 'poll' est ferme des
            // l'init. Une intention 'lengopay-card' ENCORE VIVANTE et sans page a
            // donc forcement rendu un code — sinon elle n'existerait plus.
          next_step: livePi.rail_action_url
            ? { kind: 'webview', url: livePi.rail_action_url }
            : (livePi.method === 'kulu' || livePi.method === 'lengopay-card')
              ? { kind: 'otp', payId: livePi.rail_intent_id }
              : { kind: 'poll' },
        },
      };
    }

    const { data: boostId, error: pendErr } = await sb.rpc('create_pending_boost', {
      p_product_id:   body.product_id ?? null,
      p_property_id:  body.property_id ?? null,
      p_seller_id:    userId,
      p_days:         body.days,
      p_amount_minor: amount,
    });
    if (pendErr || !boostId) {
      throwBoostError((pendErr as { message?: string })?.message ?? '', 'create_pending_boost', pendErr);
    }

    const placeholderId = `pending-init-${crypto.randomUUID()}`;
    const { data: intentRow, error: intentErr } = await sb
      .from('payment_intents')
      .insert({
        boost_id:       boostId,
        rail:           'lengopay',
        rail_intent_id: placeholderId,
        method,
        currency:       'GNF',
        amount_minor:   amount,
        payer_phone:    payerPhone ?? null,
      })
      .select('id')
      .single();
    if (intentErr || !intentRow) {
      console.error('[create-boost] intent insert error:', intentErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur intent de paiement');
    }

    let initResp;
    try {
      initResp = await initPaymentV2({
        amount_minor: amount,
        currency: 'GNF',
        type_account: rail.typeAccount,
        ...(payerPhone ? { account: toLocalGnAccount(payerPhone) } : {}),
      });
    } catch (e) {
      console.error('[create-boost] lengopay init error:', e);
      await sb.rpc('process_boost_intent_outcome', {
        p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: 'init_failed',
        p_error_code: 'RAIL_INIT_FAILED', p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
      });
      throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
    }

    const nextStep = railNextStep(lengoMethod, initResp);

    // Impasse : rail sans numero et sans page — voir railIsDeadEnd. Le boost
    // reserve n'a plus de chemin de reglement, on le referme tout de suite
    // (process_boost_intent_outcome annule l'intention ET le boost).
    if (railIsDeadEnd(lengoMethod, nextStep)) {
      console.error('[create-boost] rail sans action exploitable', {
        method: lengoMethod, pay_id: initResp.pay_id, boost_id: boostId,
      });
      await sb.rpc('process_boost_intent_outcome', {
        p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: 'no_action',
        p_error_code: 'RAIL_NO_ACTION',
        p_error_message: `pay_id=${initResp.pay_id} method=${lengoMethod}`,
      });
      throwApi('RAIL_NO_ACTION', 502, RAIL_NO_ACTION_MESSAGE);
    }

    const { error: updErr } = await sb
      .from('payment_intents')
      .update({
        rail_intent_id:  initResp.pay_id,
        rail_status:     'pending',
        rail_action_url: railActionUrl(nextStep),
        updated_at:      new Date().toISOString(),
      })
      .eq('id', intentRow.id);
    if (updErr) {
      // Le paiement existe chez Lengopay mais on ne saurait plus le relier :
      // on ferme tout de suite plutot que de laisser une ligne orpheline que le
      // cron sonderait avec un identifiant provisoire.
      console.error('[create-boost] CRITICAL intent UPDATE failed post-init', { intent_id: intentRow.id, pay_id: initResp.pay_id, error: updErr });
      await sb.rpc('process_boost_intent_outcome', {
        p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: 'pending',
        p_error_code: 'INTENT_UPDATE_FAILED', p_error_message: `pay_id=${initResp.pay_id} ${updErr.message}`.slice(0, 500),
      });
      throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement intent');
    }

    // next_step : sonder (Orange/MTN), ouvrir la page (Soutra Money) ou saisir
    // un code (Kulu).
    return { body: { boost_id: boostId, next_step: nextStep } };
  }

  // ─── Rail portefeuille (inchange) ─────────────────────────────────────────
  const { data, error } = isProperty
    ? await sb.rpc('purchase_property_boost', {
        p_property_id: body.property_id,
        p_seller_id: userId,
        p_days: body.days,
        p_amount_minor: amount,
      })
    : await sb.rpc('purchase_boost', {
        p_product_id: body.product_id,
        p_seller_id: userId,
        p_days: body.days,
        p_amount_minor: amount,
      });

  if (error) {
    throwBoostError((error as { message?: string }).message ?? '', 'purchase error', error);
  }

  // The RPC returns the bare boosts row (no listing embed). PostgREST may surface
  // a single-composite return as the object or a one-element array depending on
  // layer — tolerate both.
  const row = (Array.isArray(data) ? data[0] : data) as BoostRow | undefined;
  if (!row) {
    console.error('[create-boost] purchase returned no row');
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors du boost.');
  }
  return { body: { boost: mapBoost(row) } };
}, stripPaymentSecret));
