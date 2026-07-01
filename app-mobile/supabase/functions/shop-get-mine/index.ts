// Returns the authenticated user's shops (0..N). A user without shops gets [];
// product-create will auto-create a default one on their first product.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapShop, type ShopRow } from '@shared/catalog.ts';

Deno.serve(makePost<Record<string, unknown>>(
  '/v1/shops/get-mine',
  (b): b is Record<string, unknown> => typeof b === 'object' && b !== null,
  async ({ sb, req }) => {
    const userId = await requireUser(req);
    const { data, error } = await sb
      .from('shops_with_counts')
      .select('id, owner_id, name, about, city, cover_url, avatar_url, verified, rating, review_count, follower_count, response_time_text, product_count, opening_hours')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[shop-get-mine] query error:', error);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    return { body: { shops: (data as ShopRow[] | null ?? []).map(mapShop) } };
  },
));
