// Pre-prod: shop follow / unfollow. Mirrors product-favorite-toggle's pattern so the
// client gets one round-trip with the new state + denormalized count to render against.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { shop_id: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.shop_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.shop_id);
}

Deno.serve(makePost<Body>('/v1/shops/follow-toggle', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // A seller can't follow their own boutique — that would inflate follower_count for
  // free and read dishonestly on the storefront. Block it here, not at the RPC, so we
  // can return a clean 400 with a user-facing message instead of a generic DB error.
  const { data: shop, error: eShop } = await sb
    .from('shops')
    .select('owner_id')
    .eq('id', body.shop_id)
    .maybeSingle();
  if (eShop) {
    console.error('[shop-follow-toggle] shop lookup error:', eShop);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!shop) throwApi('SHOP_NOT_FOUND', 404, 'Boutique introuvable');
  if (shop.owner_id === userId) {
    throwApi('CANNOT_FOLLOW_SELF', 400, 'Tu ne peux pas suivre ta propre boutique.');
  }

  const { data, error } = await sb.rpc('toggle_shop_follower', {
    p_user_id: userId,
    p_shop_id: body.shop_id,
  });
  if (error) {
    console.error('[shop-follow-toggle] rpc error:', error);
    if ((error as { code?: string }).code === '23503') {
      throwApi('SHOP_NOT_FOUND', 404, 'Boutique introuvable');
    }
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row) throwApi('INTERNAL_ERROR', 500, 'Réponse invalide');
  return {
    body: {
      following: !!(row as { following: boolean }).following,
      follower_count: Number((row as { follower_count: number }).follower_count),
    },
  };
}));
