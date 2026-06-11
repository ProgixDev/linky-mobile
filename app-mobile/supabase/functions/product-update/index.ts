// Update a product the caller owns. Only the product owner (= shop owner) may edit.
// Any field except id/shop_id/created_at/view_count/fav_count is editable; counts/boosted
// are denormalized caches updated by other endpoints (favorite-toggle, boost flow, etc.).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapProduct, type ProductRow } from '@shared/catalog.ts';
import { isValidCategory, isValidCondition } from '@shared/categories.ts';

interface Body {
  id: string;
  title?: string;
  description?: string;
  price_minor?: number;
  category?: string;
  condition?: 'neuf' | 'occasion' | 'reconditionné';
  photos?: string[];
  city?: string;
  district?: string | null;
  status?: 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
}

const URL_RE = /^https?:\/\/[^\s]{8,500}$/i;
const STATUSES = ['active','reserved','sold','paused','pending'] as const;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.id)) return false;
  if (x.title !== undefined && (typeof x.title !== 'string' || x.title.trim().length < 3 || x.title.length > 120)) return false;
  if (x.description !== undefined && (typeof x.description !== 'string' || x.description.length > 2000)) return false;
  if (x.price_minor !== undefined && (typeof x.price_minor !== 'number' || !Number.isInteger(x.price_minor) || x.price_minor <= 0 || x.price_minor > 1e12)) return false;
  if (x.category !== undefined && !isValidCategory(x.category)) return false;
  if (x.condition !== undefined && !isValidCondition(x.condition)) return false;
  if (x.photos !== undefined) {
    if (!Array.isArray(x.photos) || x.photos.length > 8) return false;
    if (!x.photos.every((p) => typeof p === 'string' && URL_RE.test(p))) return false;
  }
  if (x.city !== undefined && (typeof x.city !== 'string' || x.city.trim().length < 2 || x.city.length > 80)) return false;
  if (x.district !== undefined && x.district !== null && (typeof x.district !== 'string' || x.district.length > 80)) return false;
  if (x.status !== undefined && !(STATUSES as readonly string[]).includes(x.status as string)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/products/update', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Ownership check: product → shop → owner. Single join via the FK.
  const { data: own, error: eOwn } = await sb
    .from('products').select('id, shop_id, status, shops!inner(owner_id)')
    .eq('id', body.id).maybeSingle();
  if (eOwn) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!own) throwApi('PRODUCT_NOT_FOUND', 404, 'Produit introuvable.');
  // Moderation takedown is admin-final : a removed listing accepts NO seller
  // edits (otherwise status could be flipped back to 'active'). Reinstatement
  // goes through the admin moderate-listing 'approve'.
  if ((own as { status?: string }).status === 'removed') {
    throwApi('LISTING_REMOVED', 403, 'Cette annonce a été retirée par la modération.');
  }
  // PostgREST hints: inner-joined column path is shops.owner_id; tolerate object or array shapes.
  const ownerId = Array.isArray((own as { shops: unknown }).shops)
    ? ((own as { shops: { owner_id: string }[] }).shops[0]?.owner_id)
    : (own as { shops: { owner_id: string } }).shops?.owner_id;
  if (ownerId !== userId) throwApi('FORBIDDEN', 403, 'Action refusée.');

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined)       patch.title = body.title.trim();
  if (body.description !== undefined) patch.description = body.description.trim();
  if (body.price_minor !== undefined) patch.price_minor = body.price_minor;
  if (body.category !== undefined)    patch.category = body.category;
  if (body.condition !== undefined)   patch.condition = body.condition;
  if (body.photos !== undefined)      patch.photos = body.photos;
  if (body.city !== undefined)        patch.city = body.city.trim();
  if (body.district !== undefined)    patch.district = body.district === null ? null : body.district.trim() || null;
  if (body.status !== undefined)      patch.status = body.status;

  const { data, error } = await sb
    .from('products').update(patch).eq('id', body.id)
    .select('id, shop_id, title, description, price_minor, category, condition, status, photos, boosted, view_count, fav_count, city, district, created_at')
    .single();
  if (error || !data) {
    console.error('[product-update] update error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur mise à jour');
  }
  return { body: { product: mapProduct(data as ProductRow) } };
}));
