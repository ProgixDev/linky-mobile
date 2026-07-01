// Buy a boost for one of the caller's products. All the money + validation
// logic lives in the purchase_boost RPC (one transaction: ownership check
// under a row lock → seller→platform transfer → boost row → product flag), so
// this endpoint just resolves the server-side price and maps DB errors to
// French envelopes. The client sends only { product_id, days } — never a price.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapBoost, type BoostRow } from '@shared/catalog.ts';
import { boostPrice } from '@shared/boost.ts';

interface Body {
  product_id: string;
  days: number;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.product_id !== 'string' || !UUID_RE.test(x.product_id)) return false;
  if (typeof x.days !== 'number' || !Number.isInteger(x.days)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/boosts/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const amount = boostPrice(body.days);
  if (amount === undefined) {
    throwApi('INVALID_TIER', 400, 'Durée de boost invalide.');
  }

  const { data, error } = await sb.rpc('purchase_boost', {
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
    if (msg.includes('PRODUCT_NOT_FOUND')) throwApi('NOT_FOUND', 404, 'Annonce introuvable.');
    if (msg.includes('NOT_OWNER')) throwApi('FORBIDDEN', 403, "Cette annonce ne t'appartient pas.");
    if (msg.includes('PRODUCT_NOT_ACTIVE')) {
      throwApi('PRODUCT_NOT_ACTIVE', 400, 'Seule une annonce active peut être boostée.');
    }
    if (msg.includes('SELLER_WALLET_NOT_FOUND')) {
      throwApi('WALLET_NOT_FOUND', 400, 'Ouvre ton portefeuille avant de booster.');
    }
    console.error('[create-boost] purchase_boost error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors du boost.');
  }

  // purchase_boost returns the bare boosts row (no product embed). PostgREST
  // may surface a single-composite return as the object or a one-element array
  // depending on layer — tolerate both.
  const row = (Array.isArray(data) ? data[0] : data) as BoostRow | undefined;
  if (!row) {
    console.error('[create-boost] purchase_boost returned no row');
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors du boost.');
  }
  return { body: { boost: mapBoost(row) } };
}));
