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
      .select('id, owner_id, name, about, city, cover_url, avatar_url, verified, rating, review_count, follower_count, response_time_text, product_count, opening_hours, kind, property_count, lat, lng')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[shop-get-mine] query error:', error);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    const rows = data as ShopRow[] | null ?? [];
    // This is the owner viewing/editing their OWN shop, so lat/lng are safe to
    // return here (unlike the public get-shop/list-shops). `pinned` tells the
    // client whether it's a real point or still the city-centre fallback the
    // shops_set_geo trigger fills in — at most 2 rows per caller (shop +
    // agency), so a plain per-row RPC call is plenty fast.
    const withPinned = await Promise.all(rows.map(async (r) => {
      const { data: pinned } = await sb.rpc('geo_is_pinned', {
        p_lat: r.lat, p_lng: r.lng, p_city: r.city, p_district: null,
      });
      return { ...r, pinned: pinned ?? false };
    }));
    return { body: { shops: withPinned.map(mapShop) } };
  },
));
