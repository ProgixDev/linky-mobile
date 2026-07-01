// The caller's boost history (newest first) + the current price tiers so the
// "new boost" screen can render options without hardcoding prices (the server
// stays the source of truth). status may read 'active' while ends_at is in the
// past until the hourly sweep runs; the client treats ends_at as the source of
// truth for "still live".
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapBoost, type BoostRow } from '@shared/catalog.ts';
import { BOOST_TIERS } from '@shared/boost.ts';

Deno.serve(makePost<Record<string, unknown>>(
  '/v1/boosts/list',
  (b): b is Record<string, unknown> => typeof b === 'object' && b !== null,
  async ({ sb, req }) => {
    const userId = await requireUser(req);
    const { data, error } = await sb
      .from('boosts')
      .select(
        'id, product_id, seller_id, amount_minor, days, status, starts_at, ends_at, created_at, products(title, photos, status)',
      )
      .eq('seller_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('[list-boosts] query error:', error);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    return {
      body: {
        boosts: ((data as BoostRow[] | null) ?? []).map(mapBoost),
        tiers: BOOST_TIERS.map((t) => ({ days: t.days, amountGnf: t.amount_minor })),
      },
    };
  },
));
