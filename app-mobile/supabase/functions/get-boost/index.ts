// A single boost by id, scoped to the caller (seller_id filter — a seller can
// only read their own boosts). Embeds the product for the detail screen.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapBoost, type BoostRow } from '@shared/catalog.ts';

interface Body {
  id: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.id === 'string' && UUID_RE.test(x.id);
}

Deno.serve(makePost<Body>('/v1/boosts/get', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const { data, error } = await sb
    .from('boosts')
    .select(
      'id, product_id, seller_id, amount_minor, days, status, starts_at, ends_at, created_at, products(title, photos, status)',
    )
    .eq('id', body.id)
    .eq('seller_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[get-boost] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!data) throwApi('NOT_FOUND', 404, 'Boost introuvable.');
  return { body: { boost: mapBoost(data as BoostRow) } };
}));
