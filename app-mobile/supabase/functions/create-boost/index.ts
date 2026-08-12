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
import { initPayment } from '@shared/lengopay.ts';

interface Body {
  product_id?: string;
  property_id?: string;
  days: number;
  /** Défaut 'wallet' — c'était le seul rail avant le 2026-08-12, et les anciennes
   *  versions de l'app n'envoient pas ce champ. */
  method?: 'wallet' | 'orange-money' | 'mtn-money';
  payer_phone?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const METHODS = ['wallet', 'orange-money', 'mtn-money'];

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
    throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant. Recharge ton portefeuille ou paie par Orange Money / MTN.');
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

Deno.serve(makePost<Body>('/v1/boosts/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const amount = boostPrice(body.days);
  if (amount === undefined) {
    throwApi('INVALID_TIER', 400, 'Durée de boost invalide.');
  }

  const isProperty = typeof body.property_id === 'string';
  const method = body.method ?? 'wallet';

  // ─── Rail mobile money ────────────────────────────────────────────────────
  // L'argent n'existe pas encore : on reserve le boost en 'pending_payment' (il
  // ne remonte pas l'annonce), on ouvre l'intention, et c'est le cron qui
  // activera au retour de Lengopay. Meme sequence que booking-sign-pay :
  // intention AVANT l'appel au rail, avec un rail_intent_id provisoire, pour
  // qu'aucun paiement ne puisse exister sans ligne en base.
  if (method !== 'wallet') {
    let payerPhone = body.payer_phone?.trim();
    if (!payerPhone) {
      const { data: phoneRow } = await sb
        .from('phones').select('e164').eq('user_id', userId).eq('is_primary', true).maybeSingle();
      payerPhone = phoneRow?.e164 ?? undefined;
    }
    if (!payerPhone) throwApi('PAYER_PHONE_REQUIRED', 400, 'Numéro de paiement requis');

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
        payer_phone:    payerPhone,
      })
      .select('id')
      .single();
    if (intentErr || !intentRow) {
      console.error('[create-boost] intent insert error:', intentErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur intent de paiement');
    }

    let initResp;
    try {
      initResp = await initPayment({ amount_minor: amount, currency: 'GNF' });
    } catch (e) {
      console.error('[create-boost] lengopay init error:', e);
      await sb.rpc('process_boost_intent_outcome', {
        p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: 'init_failed',
        p_error_code: 'RAIL_INIT_FAILED', p_error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
      });
      throwApi('RAIL_INIT_FAILED', 502, "Échec de l'initialisation du paiement");
    }

    const { error: updErr } = await sb
      .from('payment_intents')
      .update({ rail_intent_id: initResp.pay_id, rail_status: initResp.status, updated_at: new Date().toISOString() })
      .eq('id', intentRow.id);
    if (updErr) {
      // Le paiement existe chez Lengopay mais on ne saurait plus le relier :
      // on ferme tout de suite plutot que de laisser une ligne orpheline que le
      // cron sonderait avec un identifiant provisoire.
      console.error('[create-boost] CRITICAL intent UPDATE failed post-init', { intent_id: intentRow.id, pay_id: initResp.pay_id, error: updErr });
      await sb.rpc('process_boost_intent_outcome', {
        p_intent_id: intentRow.id, p_terminal_status: 'failed', p_rail_status: initResp.status,
        p_error_code: 'INTENT_UPDATE_FAILED', p_error_message: `pay_id=${initResp.pay_id} ${updErr.message}`.slice(0, 500),
      });
      throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement intent');
    }

    return { body: { boost_id: boostId, payment_url: initResp.payment_url } };
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
}));
