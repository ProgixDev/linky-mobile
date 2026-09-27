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
    .select('id, shop_id, title, description, price_minor, category, condition, status, photos, video_url, boosted, view_count, fav_count, city, district, stock, is_gift, has_variants, variant_sizes, variant_colors, created_at')
    .eq('id', body.id)
    .maybeSingle();
  if (error) {
    console.error('[get-product] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!data) throwApi('PRODUCT_NOT_FOUND', 404, 'Produit introuvable');
  // LA MATRICE — ici et NULLE PART AILLEURS. C'est une jointure sur une table
  // fille : la payer sur list-products ou discover-feed, c'est la payer 50 a
  // 100 fois par page, sur 3G. Seul l'ecran d'une fiche en a besoin, et il
  // n'ouvre qu'un article a la fois.
  const { data: variants, error: eVar } = await sb
    .from('product_variants')
    .select('id, size, color, stock')
    .eq('product_id', body.id)
    .eq('status', 'active')
    // DANS L'ORDRE OU LE VENDEUR LES A SAISIES, pas dans l'ordre alphabetique.
    // Des tailles de vetements se lisent S, M, L, XL ; triees par texte elles
    // donnent L, M, S, XL — l'acheteur croirait l'appli cassee, et le vendeur
    // verrait ses propres tailles melangees dans son formulaire (la matrice
    // reconstruit ses deux listes depuis CETTE reponse).
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (eVar) console.error('[get-product] variants error:', eVar);

  return {
    body: {
      product: {
        ...mapProduct(data as ProductRow),
        variants: ((variants as { id: string; size: string; color: string; stock: number | null }[] | null) ?? [])
          .map((v) => ({ id: v.id, size: v.size, color: v.color, stock: v.stock })),
      },
    },
  };
}));
