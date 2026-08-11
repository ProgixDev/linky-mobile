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

interface Body {
  product_id?: string;
  property_id?: string;
  days: number;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.days !== 'number' || !Number.isInteger(x.days)) return false;
  const hasProduct = typeof x.product_id === 'string' && UUID_RE.test(x.product_id);
  const hasProperty = typeof x.property_id === 'string' && UUID_RE.test(x.property_id);
  // exactly one target (XOR)
  return hasProduct !== hasProperty;
}

Deno.serve(makePost<Body>('/v1/boosts/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const amount = boostPrice(body.days);
  if (amount === undefined) {
    throwApi('INVALID_TIER', 400, 'Durée de boost invalide.');
  }

  const isProperty = typeof body.property_id === 'string';
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
    const msg = (error as { message?: string }).message ?? '';
    if (msg.includes('INSUFFICIENT_FUNDS')) {
      throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant. Recharge ton portefeuille pour booster.');
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
    console.error('[create-boost] purchase error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors du boost.');
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
