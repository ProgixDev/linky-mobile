import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { mapShop, type ShopRow } from '@shared/catalog.ts';
import { tryGetUser } from '@shared/auth.ts';

interface Body { id: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.id === 'string' && /^[0-9a-f-]{36}$/i.test(x.id);
}

Deno.serve(makePost<Body>('/v1/shops/get', valid, async ({ sb, body, req }) => {
  const { data, error } = await sb
    .from('shops_with_counts')
    .select('id, owner_id, name, about, city, cover_url, avatar_url, verified, rating, review_count, follower_count, response_time_text, product_count, opening_hours')
    .eq('id', body.id)
    .maybeSingle();
  if (error) {
    console.error('[get-shop] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!data) throwApi('SHOP_NOT_FOUND', 404, 'Boutique introuvable');

  // Pre-prod: enrich with the caller's own follow state so the storefront's
  // "Suivre" / "Suivi(e)" button paints correctly on first render. Anonymous
  // callers always see is_following=false ; the toggle endpoint refuses
  // anyway for unauth, so the strict subset is honest.
  const userId = await tryGetUser(req);
  let isFollowing = false;
  if (userId) {
    const { data: row } = await sb
      .from('shop_followers')
      .select('user_id')
      .eq('user_id', userId)
      .eq('shop_id', body.id)
      .maybeSingle();
    isFollowing = !!row;
  }

  return { body: { shop: { ...mapShop(data as ShopRow), isFollowing } } };
}));
