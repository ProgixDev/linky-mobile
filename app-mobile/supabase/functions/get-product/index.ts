import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { mapProduct, type ProductRow } from '@shared/catalog.ts';

interface Body { id: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.id === 'string' && /^[0-9a-f-]{36}$/i.test(x.id);
}

Deno.serve(makePost<Body>('/v1/products/get', valid, async ({ sb, body }) => {
  const { data, error } = await sb
    .from('products')
    .select('id, shop_id, title, description, price_minor, category, condition, status, photos, video_url, boosted, view_count, fav_count, city, district, created_at')
    .eq('id', body.id)
    .maybeSingle();
  if (error) {
    console.error('[get-product] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!data) throwApi('PRODUCT_NOT_FOUND', 404, 'Produit introuvable');
  return { body: { product: mapProduct(data as ProductRow) } };
}));
