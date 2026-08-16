// Create a product owned by one of the caller's shops. If no shop_id is provided AND the
// caller has no shop, auto-create a default "Ma boutique" so the create wizard works
// without a separate "set up your shop first" step. The shop can be renamed later via shop-upsert.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapProduct, type ProductRow } from '@shared/catalog.ts';
import { isValidCategory, isValidCondition } from '@shared/categories.ts';
import { diditConfig, kycRequiredToPublish } from '@shared/didit.ts';

interface Body {
  shop_id?: string;
  title: string;
  description?: string;
  price_minor: number;
  category: string;
  condition: 'neuf' | 'occasion' | 'reconditionné';
  photos: string[];
  video_url?: string;
  city: string;
  district?: string;
  stock?: number | null;
}

const URL_RE = /^https?:\/\/[^\s]{8,500}$/i;

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.shop_id !== undefined && !isUuid(x.shop_id)) return false;
  if (typeof x.title !== 'string' || x.title.trim().length < 3 || x.title.length > 120) return false;
  if (x.description !== undefined && (typeof x.description !== 'string' || x.description.length > 2000)) return false;
  if (typeof x.price_minor !== 'number' || !Number.isInteger(x.price_minor) || x.price_minor <= 0 || x.price_minor > 1e12) return false;
  if (!isValidCategory(x.category)) return false;
  if (!isValidCondition(x.condition)) return false;
  if (!Array.isArray(x.photos) || x.photos.length > 8) return false;
  if (!x.photos.every((p) => typeof p === 'string' && URL_RE.test(p))) return false;
  if (x.video_url !== undefined && (typeof x.video_url !== 'string' || !URL_RE.test(x.video_url))) return false;
  if (typeof x.city !== 'string' || x.city.trim().length < 2 || x.city.length > 80) return false;
  if (x.district !== undefined && (typeof x.district !== 'string' || x.district.length > 80)) return false;
  // Quantite disponible. null/absent = non renseignee, donc sans plafond.
  if (x.stock !== undefined && x.stock !== null &&
      (typeof x.stock !== 'number' || !Number.isInteger(x.stock) || x.stock < 0 || x.stock > 100000)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/products/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Phase T.1 — gate on role + KYC BEFORE the (auto-creating) shop work, so
  // a pure buyer probing this endpoint can never end up with a phantom
  // "Ma boutique" row. Both checks are pulled in a single read.
  const { data: caller, error: eCaller } = await sb
    .from('users')
    .select('roles, kyc_status, display_name')
    .eq('id', userId)
    .single();
  if (eCaller || !caller) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  const roles: string[] = Array.isArray(caller.roles) ? (caller.roles as string[]) : [];
  if (!roles.includes('seller')) {
    throwApi('ROLE_REQUIRED', 403, 'Active le rôle vendeur dans ton profil pour publier.');
  }
  // Publishing no longer requires ID verification by default (client
  // 2026-08-05 — most sellers in Guinea have no ID document, which blocked
  // them from listing at all). Re-enable with LINKY_KYC_REQUIRED_TO_PUBLISH=1.
  if (kycRequiredToPublish() && diditConfig() && caller.kyc_status !== 'approved') {
    throwApi('KYC_REQUIRED', 403, "Vérifie ton identité pour publier — c'est rapide.");
  }

  let shopId = body.shop_id;
  if (shopId) {
    // Verify ownership: the shop must belong to the caller.
    const { data: owned, error } = await sb
      .from('shops').select('id').eq('id', shopId).eq('owner_id', userId)
      .eq('kind', 'shop').maybeSingle();
    if (error) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    if (!owned) throwApi('SHOP_NOT_FOUND', 404, 'Boutique introuvable.');
  } else {
    // The caller's BOUTIQUE specifically — boutique and agence are separate
    // profiles since 2026-08-07 (shops.kind), so this must never fall back to
    // their agency.
    const { data: existing, error: eList } = await sb
      .from('shops').select('id').eq('owner_id', userId).eq('kind', 'shop')
      .maybeSingle();
    if (eList) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    if (existing) {
      shopId = existing.id as string;
    } else {
      // Personalize the auto-created shop from the owner's first name so buyers
      // never see a generic « Ma boutique » (which read like « my shop » on
      // every listing). Falls back to « Ma boutique » when the name is unset.
      const firstName = String(caller.display_name ?? '').trim().split(/\s+/)[0];
      const shopName = firstName ? `Boutique de ${firstName}` : 'Ma boutique';
      const { data: created, error: eIns } = await sb
        .from('shops')
        .insert({ owner_id: userId, name: shopName, city: body.city.trim(), about: '', kind: 'shop' })
        .select('id').single();
      if (eIns || !created) {
        console.error('[product-create] auto-shop insert error:', eIns);
        throwApi('INTERNAL_ERROR', 500, 'Erreur création boutique');
      }
      shopId = created.id as string;
    }
  }

  const insert = {
    shop_id: shopId,
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    price_minor: body.price_minor,
    category: body.category,
    condition: body.condition,
    photos: body.photos,
    video_url: body.video_url ?? null,
    city: body.city.trim(),
    district: body.district?.trim() || null,
    stock: body.stock ?? null,
    status: 'active',
  };
  const { data, error } = await sb
    .from('products')
    .insert(insert)
    .select('id, shop_id, title, description, price_minor, category, condition, status, photos, video_url, boosted, view_count, fav_count, city, district, stock, created_at')
    .single();
  if (error || !data) {
    console.error('[product-create] insert error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur création produit');
  }
  return { body: { product: mapProduct(data as ProductRow) } };
}));
