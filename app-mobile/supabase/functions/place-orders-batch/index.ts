// Panier multi-boutiques : UN paiement, PLUSIEURS commandes.
// Client 2026-08-21 : « un seul bouton dans le panier, le client valide tout en
// une fois, meme avec des produits de boutiques differentes ».
//
// Ce que fait cet endpoint, dans l'ordre — et l'ordre est une propriete de
// securite, pas un detail de style :
//
//   1. place_orders_batch cree les N commandes dans UNE transaction. Un echec
//      sur le dernier article annule les precedentes : il ne peut pas exister
//      de lot a moitie constitue qu'un paiement viendrait regler.
//   2. Le montant a encaisser est RELU EN BASE (batch_total_minor). Il n'est ni
//      envoye par le client, ni recalcule ici en JavaScript. C'est la meme
//      source que celle que process_batch_intent_outcome verifiera au
//      reglement : les deux ne peuvent donc pas diverger.
//   3. L'intention de paiement est inserée AVANT l'appel au rail, avec un
//      identifiant provisoire. Aucun paiement ne peut donc exister chez
//      Lengopay sans ligne correspondante chez nous.
//   4. En cas d'echec du rail, l'intention passe en 'failed', ce qui annule
//      TOUTES les commandes du lot d'un coup.
//
// Le portefeuille ne passe pas par ici : place_orders_batch debite et alimente
// le sequestre dans sa propre transaction, la commande naît deja payee.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { initPayment, LENGOPAY_MAX_AMOUNT_MINOR } from '@shared/lengopay.ts';
import { DELIVERY_FEE_MINOR } from '@shared/delivery.ts';
import { stripeClient, stripeConfigured, stripePublishableKey } from '@shared/stripe.ts';
import { formatGNF } from '@shared/push.ts';

interface ItemInput { product_id: string; quantity: number }

interface Body {
  items: ItemInput[];
  payment_method: 'wallet' | 'orange-money' | 'mtn-money' | 'card';
  delivery_mode?: 'pickup' | 'delivery';
  payer_phone?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
// 'card' ajoute le 2026-08-24 : le bouton Carte, active la veille pour les
// profils a l'etranger, appelait encore place-order (mono-boutique) — un
// panier a deux boutiques echouait avec MULTIPLE_SELLERS. La carte n'avait
// jamais ete construite pour le panier multi-boutiques du 21 aout, faute
// d'avoir jamais ete testee : elle etait masquee dans l'interface jusqu'a
// avant-hier.
const METHODS = ['wallet', 'orange-money', 'mtn-money', 'card'];

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (!Array.isArray(x.items) || x.items.length === 0 || x.items.length > 40) return false;
  for (const raw of x.items) {
    const it = raw as ItemInput;
    if (!it || typeof it.product_id !== 'string' || !UUID_RE.test(it.product_id)) return false;
    if (typeof it.quantity !== 'number' || !Number.isInteger(it.quantity)) return false;
    if (it.quantity <= 0 || it.quantity > 100) return false;
  }
  if (typeof x.payment_method !== 'string' || !METHODS.includes(x.payment_method)) return false;
  if (x.delivery_mode !== undefined && x.delivery_mode !== 'pickup' && x.delivery_mode !== 'delivery') return false;
  if (x.payer_phone !== undefined && typeof x.payer_phone !== 'string') return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/orders/batch', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Meme garde qu'en mono-boutique (place-order) : refuser AVANT de creer la
  // moindre commande, pas apres — un lot a moitie constitue qu'aucun rail ne
  // peut plus regler serait pire qu'un refus immediat.
  if (body.payment_method === 'card' && !stripeConfigured()) {
    throwApi('STRIPE_NOT_CONFIGURED', 503, 'Le paiement par carte arrive bientôt.');
  }

  const deliveryMode = body.delivery_mode ?? 'delivery';
  // Le frais de livraison est decide ICI, cote serveur, et UNE SEULE FOIS pour
  // tout le lot — le corps de la requete ne porte jamais de montant.
  const deliveryFeeMinor = deliveryMode === 'delivery' ? DELIVERY_FEE_MINOR : 0;

  const { data: batchId, error: rpcErr } = await sb.rpc('place_orders_batch', {
    p_buyer_id:           userId,
    p_items:              body.items,
    p_payment_method:     body.payment_method,
    p_delivery_mode:      deliveryMode,
    p_delivery_fee_minor: deliveryFeeMinor,
  });
  if (rpcErr || !batchId) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    console.error('[place-orders-batch] rpc error:', rpcErr);
    if (msg.includes('PRODUCT_NOT_FOUND'))       throwApi('PRODUCT_NOT_FOUND', 404, 'Produit introuvable.');
    if (msg.includes('PRODUCT_NOT_AVAILABLE'))   throwApi('PRODUCT_NOT_AVAILABLE', 400, 'Produit indisponible.');
    if (msg.includes('OUT_OF_STOCK'))            throwApi('OUT_OF_STOCK', 400, 'Un article de ton panier est en rupture de stock.');
    if (msg.includes('INSUFFICIENT_STOCK'))      throwApi('INSUFFICIENT_STOCK', 400, "Il ne reste plus assez d'exemplaires d'un article.");
    if (msg.includes('BUYER_IS_SELLER'))         throwApi('BUYER_IS_SELLER', 400, 'Tu ne peux pas acheter tes propres articles.');
    if (msg.includes('DUPLICATE_ITEM'))          throwApi('INVALID_BODY', 400, 'Article en double dans le panier.');
    if (msg.includes('TOO_MANY_SHOPS'))          throwApi('INVALID_BODY', 400, 'Trop de boutiques dans un même panier.');
    if (msg.includes('TOO_MANY_ITEMS'))          throwApi('INVALID_BODY', 400, "Trop d'articles dans le panier.");
    if (msg.includes('INVALID_QUANTITY'))        throwApi('INVALID_BODY', 400, 'Quantité invalide.');
    if (msg.includes('INSUFFICIENT_FUNDS'))      throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant pour payer ce panier.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur création des commandes');
  }

  // Relecture des commandes creees. Comme dans place-order : la transaction est
  // DEJA validee, donc un echec de lecture ne doit pas se transformer en 500 —
  // wrap.ts effacerait la reservation d'idempotence, et un reessai avec la meme
  // cle rejouerait la creation. On reessaie donc la lecture.
  let orders: { id: string; total_minor: number; status: string }[] | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await sb
      .from('orders')
      .select('id, total_minor, status')
      .eq('batch_id', batchId)
      .order('created_at');
    if (!res.error && res.data && res.data.length > 0) {
      orders = res.data as typeof orders;
      break;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 200));
  }
  if (!orders) {
    console.error('[place-orders-batch] readback failed for batch', batchId);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture des commandes');
  }

  // Portefeuille : place_orders_batch a deja debite et alimente le sequestre.
  if (body.payment_method === 'wallet') {
    return { body: { batch_id: batchId, orders, paid: true } };
  }

  // ─── Rail CARTE (Stripe) — un seul PaymentIntent pour tout le lot ─────────
  // Decalque exact de la branche carte de place-order, au montant pres : la
  // meme somme relue en base (batch_total_minor), jamais calculee ici. La
  // page de paiement Stripe s'ouvre UNE fois pour l'ensemble du lot, comme
  // pour Orange/MTN.
  if (body.payment_method === 'card') {
    const { data: totalMinor, error: totalErr } = await sb.rpc('batch_total_minor', { p_batch_id: batchId });
    if (totalErr || typeof totalMinor !== 'number' || totalMinor <= 0) {
      console.error('[place-orders-batch] batch_total_minor error:', totalErr, totalMinor);
      throwApi('INTERNAL_ERROR', 500, 'Erreur calcul du montant');
    }

    const placeholderId = `pending-init-${crypto.randomUUID()}`;
    const { data: intentRow, error: intentErr } = await sb
      .from('payment_intents')
      .insert({
        batch_id:       batchId,
        rail:           'stripe',
        rail_intent_id: placeholderId,
        method:         'card',
        currency:       'GNF',
        amount_minor:   totalMinor,
        payer_phone:    null,
      })
      .select('id')
      .single();
    if (intentErr || !intentRow) {
      await sb.from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('batch_id', batchId).eq('status', 'placed');
      console.error('[place-orders-batch] stripe intent insert error:', intentErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur intent de paiement');
    }

    let stripeIntent;
    try {
      stripeIntent = await stripeClient().paymentIntents.create({
        amount: Number(totalMinor),
        currency: 'gnf',
        automatic_payment_methods: { enabled: true },
        metadata: { batch_id: batchId, intent_id: intentRow.id, user_id: userId },
      });
      if (!stripeIntent.client_secret) throw new Error('missing client_secret');
    } catch (e) {
      console.error('[place-orders-batch] stripe init error:', e);
      await sb.rpc('process_batch_intent_outcome', {
        p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: 'init_failed',
        p_error_code: 'RAIL_INIT_FAILED',
        p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
      });
      throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
    }

    const { error: updErr } = await sb
      .from('payment_intents')
      .update({ rail_intent_id: stripeIntent.id, rail_status: stripeIntent.status, updated_at: new Date().toISOString() })
      .eq('id', intentRow.id);
    if (updErr) {
      console.error('[place-orders-batch] CRITICAL stripe intent UPDATE failed post-init', {
        intent_id: intentRow.id, stripe_pi: stripeIntent.id, error: updErr,
      });
      try {
        await stripeClient().paymentIntents.cancel(stripeIntent.id);
      } catch (cancelErr) {
        console.error('[place-orders-batch] CRITICAL stripe PI cancel also failed — manual reconcile needed', {
          stripe_pi: stripeIntent.id, error: cancelErr,
        });
      }
      await sb.rpc('process_batch_intent_outcome', {
        p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: stripeIntent.status,
        p_error_code: 'INTENT_UPDATE_FAILED',
        p_error_message: `stripe_pi=${stripeIntent.id} update_err=${updErr.message}`.slice(0, 500),
      });
      throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement intent');
    }

    return {
      body: {
        batch_id: batchId,
        orders,
        payment: {
          client_secret: stripeIntent.client_secret,
          publishable_key: stripePublishableKey(),
        },
      },
    };
  }

  // ─── Rail mobile money ────────────────────────────────────────────────────
  let payerPhone = body.payer_phone?.trim();
  if (!payerPhone) {
    const { data: phoneRow } = await sb
      .from('phones').select('e164').eq('user_id', userId).eq('is_primary', true).maybeSingle();
    payerPhone = phoneRow?.e164 ?? undefined;
  }
  if (!payerPhone) throwApi('PAYER_PHONE_REQUIRED', 400, 'Numéro de paiement requis');

  // Le montant vient de la BASE, jamais d'une somme calculee ici. C'est la
  // meme valeur que la garde d'egalite verifiera au reglement.
  const { data: totalMinor, error: totalErr } = await sb.rpc('batch_total_minor', { p_batch_id: batchId });
  if (totalErr || typeof totalMinor !== 'number' || totalMinor <= 0) {
    console.error('[place-orders-batch] batch_total_minor error:', totalErr, totalMinor);
    throwApi('INTERNAL_ERROR', 500, 'Erreur calcul du montant');
  }

  // Plafond Lengopay (25/08, cf. lengopay.ts) : rien n'a encore ete tente au
  // rail, mais les N commandes du lot existent deja (etape 1) — meme geste
  // d'annulation que l'echec d'insertion d'intention plus bas, pour ne pas
  // les laisser 'placed' sans intention de paiement.
  if (totalMinor > LENGOPAY_MAX_AMOUNT_MINOR) {
    await sb.from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('batch_id', batchId).eq('status', 'placed');
    throwApi('LENGOPAY_AMOUNT_LIMIT', 400,
      `Ce montant (${formatGNF(totalMinor)}) dépasse le plafond autorisé pour Orange Money/MTN (${formatGNF(LENGOPAY_MAX_AMOUNT_MINOR)}). Merci de nous contacter pour un autre moyen de paiement.`);
  }

  const placeholderId = `pending-init-${crypto.randomUUID()}`;
  const { data: intentRow, error: intentErr } = await sb
    .from('payment_intents')
    .insert({
      batch_id:       batchId,
      rail:           'lengopay',
      rail_intent_id: placeholderId,
      method:         body.payment_method,
      currency:       'GNF',
      amount_minor:   totalMinor,
      payer_phone:    payerPhone,
    })
    .select('id')
    .single();
  if (intentErr || !intentRow) {
    // Echec AVANT tout appel au rail : rien n'a ete encaisse, on annule le lot.
    await sb.from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('batch_id', batchId).eq('status', 'placed');
    console.error('[place-orders-batch] intent insert error:', intentErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur intent de paiement');
  }

  let initResp;
  try {
    initResp = await initPayment({ amount_minor: Number(totalMinor), currency: 'GNF' });
  } catch (e) {
    console.error('[place-orders-batch] lengopay init error:', e);
    await sb.rpc('process_batch_intent_outcome', {
      p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: 'init_failed',
      p_error_code: 'RAIL_INIT_FAILED',
      p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
    });
    throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
  }

  const { error: updErr } = await sb
    .from('payment_intents')
    .update({ rail_intent_id: initResp.pay_id, rail_status: initResp.status, updated_at: new Date().toISOString() })
    .eq('id', intentRow.id);
  if (updErr) {
    // Le paiement existe chez Lengopay mais on ne saurait plus le relier : on
    // ferme immediatement plutot que de laisser une ligne que le cron sonderait
    // avec un identifiant provisoire.
    console.error('[place-orders-batch] CRITICAL intent UPDATE failed post-init', {
      intent_id: intentRow.id, pay_id: initResp.pay_id, error: updErr,
    });
    await sb.rpc('process_batch_intent_outcome', {
      p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: initResp.status,
      p_error_code: 'INTENT_UPDATE_FAILED',
      p_error_message: `pay_id=${initResp.pay_id} ${updErr.message}`.slice(0, 500),
    });
    throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement intent');
  }

  return {
    body: {
      batch_id:     batchId,
      orders,
      total_minor:  totalMinor,
      payment_url:  initResp.payment_url,
    },
  };
}));
