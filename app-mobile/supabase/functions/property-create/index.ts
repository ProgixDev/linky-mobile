// Create a property owned by one of the caller's shops. Same auto-create-shop fallback as
// product-create so the wizard doesn't need a separate "set up your shop first" step; the
// default name is "Mon agence" if the user has no shop yet. per_month is server-derived
// from type (location ⇒ true, vente/terrain ⇒ false) so the client can't drift from the
// schema. Atomic insert (property row + photo rows) goes through the
// create_property_with_photos RPC so a failed photo insert rolls the property back too.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapProperty, type PropertyRow } from '@shared/catalog.ts';
import { diditConfig } from '@shared/didit.ts';

interface PropertyPhotoBody {
  url: string;
  storage_path: string;
  position: number;
}

interface Body {
  shop_id?: string;
  type: 'location' | 'vente' | 'terrain';
  title: string;
  description?: string;
  price_minor: number;
  bedrooms?: number;
  area_sqm?: number;
  furnished?: boolean;
  amenities: string[];
  city: string;
  district?: string;
  distance_to_road_m: number;
  lat?: number;
  lng?: number;
  photos: PropertyPhotoBody[];
}

const URL_RE = /^https?:\/\/[^\s]{8,500}$/i;
const SAFE_PATH_RE = /^[A-Za-z0-9._\-\/]{1,200}$/;
const TYPES = new Set(['location', 'vente', 'terrain']);

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
}

function validPhoto(p: unknown): p is PropertyPhotoBody {
  if (typeof p !== 'object' || p === null) return false;
  const x = p as Record<string, unknown>;
  if (typeof x.url !== 'string' || !URL_RE.test(x.url)) return false;
  if (typeof x.storage_path !== 'string' || !SAFE_PATH_RE.test(x.storage_path)) return false;
  if (typeof x.position !== 'number' || !Number.isInteger(x.position)
      || x.position < 0 || x.position > 11) return false;
  return true;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.shop_id !== undefined && !isUuid(x.shop_id)) return false;
  if (typeof x.type !== 'string' || !TYPES.has(x.type as string)) return false;
  if (typeof x.title !== 'string' || x.title.trim().length < 3 || x.title.length > 120) return false;
  if (x.description !== undefined &&
      (typeof x.description !== 'string' || x.description.length > 2000)) return false;
  if (typeof x.price_minor !== 'number' || !Number.isInteger(x.price_minor)
      || x.price_minor <= 0 || x.price_minor > 1e12) return false;
  if (x.bedrooms !== undefined &&
      (typeof x.bedrooms !== 'number' || !Number.isInteger(x.bedrooms)
       || x.bedrooms < 0 || x.bedrooms > 50)) return false;
  if (x.area_sqm !== undefined &&
      (typeof x.area_sqm !== 'number' || !Number.isInteger(x.area_sqm)
       || x.area_sqm < 0 || x.area_sqm > 1_000_000)) return false;
  if (x.furnished !== undefined && typeof x.furnished !== 'boolean') return false;
  if (!Array.isArray(x.amenities) || x.amenities.length > 20) return false;
  if (!x.amenities.every((a) => typeof a === 'string' && a.length > 0 && a.length <= 30)) return false;
  if (typeof x.city !== 'string' || x.city.trim().length < 2 || x.city.length > 80) return false;
  if (x.district !== undefined &&
      (typeof x.district !== 'string' || x.district.length > 80)) return false;
  if (typeof x.distance_to_road_m !== 'number' || !Number.isInteger(x.distance_to_road_m)
      || x.distance_to_road_m < 0 || x.distance_to_road_m > 50_000) return false;
  if (x.lat !== undefined && (typeof x.lat !== 'number' || x.lat < -90 || x.lat > 90)) return false;
  if (x.lng !== undefined && (typeof x.lng !== 'number' || x.lng < -180 || x.lng > 180)) return false;
  if (!Array.isArray(x.photos) || x.photos.length === 0 || x.photos.length > 12) return false;
  if (!x.photos.every(validPhoto)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/properties/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Phase T.1 — gate on role + KYC BEFORE the (auto-creating) shop work, so
  // a pure buyer probing this endpoint can never end up with a phantom
  // "Mon agence" row. Both checks are pulled in a single read.
  const { data: caller, error: eCaller } = await sb
    .from('users')
    .select('roles, kyc_status')
    .eq('id', userId)
    .single();
  if (eCaller || !caller) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  const roles: string[] = Array.isArray(caller.roles) ? (caller.roles as string[]) : [];
  if (!roles.includes('agent')) {
    throwApi('ROLE_REQUIRED', 403, 'Active le rôle agent dans ton profil pour publier.');
  }
  // Soft-gate : KYC is only enforced when Didit is configured (creds live).
  // While Didit is dark NO user can reach 'approved', so a hard gate would
  // block every publish in V1. diditConfig() flips this on the moment
  // LINKY_DIDIT_API_KEY + LINKY_DIDIT_WORKFLOW_ID land — no code change
  // needed at cutover.
  if (diditConfig() && caller.kyc_status !== 'approved') {
    throwApi('KYC_REQUIRED', 403, "Vérifie ton identité pour publier — c'est rapide.");
  }

  // Resolve or create the seller's shop. V1 ties products + properties to a single shop
  // per user; if "Ma boutique" already exists from a product publish, reuse it.
  let shopId = body.shop_id;
  if (shopId) {
    const { data: owned, error } = await sb
      .from('shops').select('id').eq('id', shopId).eq('owner_id', userId).maybeSingle();
    if (error) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    if (!owned) throwApi('SHOP_NOT_FOUND', 404, 'Boutique introuvable.');
  } else {
    const { data: existing, error: eList } = await sb
      .from('shops').select('id').eq('owner_id', userId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (eList) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    if (existing) {
      shopId = existing.id as string;
    } else {
      const { data: created, error: eIns } = await sb
        .from('shops')
        .insert({ owner_id: userId, name: 'Mon agence', city: body.city.trim(), about: '' })
        .select('id').single();
      if (eIns || !created) {
        console.error('[property-create] auto-shop insert error:', eIns);
        throwApi('INTERNAL_ERROR', 500, 'Erreur création boutique');
      }
      shopId = created.id as string;
    }
  }

  const per_month = body.type === 'location';

  // Re-normalize photo positions to 0..N-1 so the cover is always at 0 regardless of what
  // the client sent. The RPC trusts these positions.
  const photosPayload = body.photos
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((p, idx) => ({
      url: p.url,
      storage_path: p.storage_path,
      position: idx,
    }));

  const propertyPayload = {
    type: body.type,
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    price_minor: body.price_minor,
    per_month,
    bedrooms: body.bedrooms ?? null,
    area_sqm: body.area_sqm ?? null,
    furnished: body.furnished ?? null,
    amenities: body.amenities,
    city: body.city.trim(),
    district: body.district?.trim() || null,
    distance_to_road_m: body.distance_to_road_m,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    status: 'active',
  };

  const { data: newId, error: rpcErr } = await sb.rpc('create_property_with_photos', {
    p_owner_id: userId,
    p_shop_id: shopId,
    p_property: propertyPayload,
    p_photos: photosPayload,
  });
  if (rpcErr || !newId) {
    console.error('[property-create] RPC error:', rpcErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur création annonce');
  }

  // Read back via the view (cover + photo_count for free) plus all photo URLs in order
  // for the frontend's photos: string[] shape.
  const { data: prop, error: propErr } = await sb
    .from('properties_with_cover')
    .select('id, owner_id, shop_id, type, title, description, price_minor, per_month, bedrooms, area_sqm, furnished, amenities, city, district, distance_to_road_m, lat, lng, video_url, status, view_count, fav_count, created_at')
    .eq('id', newId)
    .single();
  if (propErr || !prop) {
    console.error('[property-create] fetch error:', propErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture annonce');
  }

  const { data: photoRows, error: photoErr } = await sb
    .from('property_photos')
    .select('url')
    .eq('property_id', newId)
    .order('position', { ascending: true });
  if (photoErr) {
    console.error('[property-create] photos fetch error:', photoErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture photos');
  }

  const photoUrls = (photoRows ?? []).map((p) => p.url as string);

  return { body: { property: mapProperty(prop as PropertyRow, photoUrls) } };
}));
