// Update a property the caller owns. Only the property owner (properties.owner_id
// directly — no shop join needed because property.owner_id is required) may edit.
// per_month is re-derived when type changes. Photos: atomic replacement via the
// replace_property_photos RPC. Property UPDATE is a separate statement (so a failure
// of either is independent), but the photos replacement itself is now safe.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapProperty, type PropertyRow } from '@shared/catalog.ts';

interface PropertyPhotoBody { url: string; storage_path: string; position: number }

interface Body {
  id: string;
  type?: 'location' | 'vente' | 'terrain';
  title?: string;
  description?: string;
  // Rental billing period (locations only). true ⇒ /mois, false ⇒ /jour.
  per_month?: boolean;
  price_minor?: number;
  bedrooms?: number | null;
  area_sqm?: number | null;
  furnished?: boolean | null;
  amenities?: string[];
  city?: string;
  district?: string | null;
  distance_to_road_m?: number;
  lat?: number | null;
  lng?: number | null;
  photos?: PropertyPhotoBody[];
  status?: 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
}

const URL_RE = /^https?:\/\/[^\s]{8,500}$/i;
const SAFE_PATH_RE = /^[A-Za-z0-9._\-\/]{1,200}$/;
const TYPES = new Set(['location', 'vente', 'terrain']);
const STATUSES = ['active', 'reserved', 'sold', 'paused', 'pending'] as const;

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
  if (!isUuid(x.id)) return false;
  if (x.type !== undefined && (typeof x.type !== 'string' || !TYPES.has(x.type as string))) return false;
  if (x.title !== undefined && (typeof x.title !== 'string' || x.title.trim().length < 3 || x.title.length > 120)) return false;
  if (x.description !== undefined && (typeof x.description !== 'string' || x.description.length > 2000)) return false;
  if (x.per_month !== undefined && typeof x.per_month !== 'boolean') return false;
  if (x.price_minor !== undefined && (typeof x.price_minor !== 'number' || !Number.isInteger(x.price_minor) || x.price_minor <= 0 || x.price_minor > 1e12)) return false;
  if (x.bedrooms !== undefined && x.bedrooms !== null && (typeof x.bedrooms !== 'number' || !Number.isInteger(x.bedrooms) || x.bedrooms < 0 || x.bedrooms > 50)) return false;
  if (x.area_sqm !== undefined && x.area_sqm !== null && (typeof x.area_sqm !== 'number' || !Number.isInteger(x.area_sqm) || x.area_sqm < 0 || x.area_sqm > 1_000_000)) return false;
  if (x.furnished !== undefined && x.furnished !== null && typeof x.furnished !== 'boolean') return false;
  if (x.amenities !== undefined) {
    if (!Array.isArray(x.amenities) || x.amenities.length > 20) return false;
    if (!x.amenities.every((a) => typeof a === 'string' && a.length > 0 && a.length <= 30)) return false;
  }
  if (x.city !== undefined && (typeof x.city !== 'string' || x.city.trim().length < 2 || x.city.length > 80)) return false;
  if (x.district !== undefined && x.district !== null && (typeof x.district !== 'string' || x.district.length > 80)) return false;
  if (x.distance_to_road_m !== undefined && (typeof x.distance_to_road_m !== 'number' || !Number.isInteger(x.distance_to_road_m) || x.distance_to_road_m < 0 || x.distance_to_road_m > 50_000)) return false;
  if (x.lat !== undefined && x.lat !== null && (typeof x.lat !== 'number' || x.lat < -90 || x.lat > 90)) return false;
  if (x.lng !== undefined && x.lng !== null && (typeof x.lng !== 'number' || x.lng < -180 || x.lng > 180)) return false;
  if (x.photos !== undefined) {
    if (!Array.isArray(x.photos) || x.photos.length === 0 || x.photos.length > 12) return false;
    if (!x.photos.every(validPhoto)) return false;
  }
  if (x.status !== undefined && !(STATUSES as readonly string[]).includes(x.status as string)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/properties/update', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Ownership: properties.owner_id is required, so a single fetch is enough.
  const { data: own, error: eOwn } = await sb
    .from('properties').select('id, owner_id, status, type')
    .eq('id', body.id).maybeSingle();
  if (eOwn) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!own) throwApi('PROPERTY_NOT_FOUND', 404, 'Annonce introuvable.');
  if ((own as { owner_id: string }).owner_id !== userId) throwApi('FORBIDDEN', 403, 'Action refusée.');
  // Moderation takedown is admin-final : no seller edits on a removed listing
  // (reinstatement = admin moderate-listing 'approve').
  if ((own as { status?: string }).status === 'removed') {
    throwApi('LISTING_REMOVED', 403, 'Cette annonce a été retirée par la modération.');
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.type !== undefined) {
    patch.type = body.type;
    // On a type change, honor an explicit rental period for locations; monthly
    // by default. Non-locations force per_month=false.
    patch.per_month = body.type === 'location' ? (body.per_month ?? true) : false;
  } else if (body.per_month !== undefined && (own as { type?: string }).type === 'location') {
    // Period toggled without a type change — only applies to existing rentals.
    patch.per_month = body.per_month;
  }
  if (body.title !== undefined)              patch.title = body.title.trim();
  if (body.description !== undefined)        patch.description = body.description.trim();
  if (body.price_minor !== undefined)        patch.price_minor = body.price_minor;
  if (body.bedrooms !== undefined)           patch.bedrooms = body.bedrooms;
  if (body.area_sqm !== undefined)           patch.area_sqm = body.area_sqm;
  if (body.furnished !== undefined)          patch.furnished = body.furnished;
  if (body.amenities !== undefined)          patch.amenities = body.amenities;
  if (body.city !== undefined)               patch.city = body.city.trim();
  if (body.district !== undefined)           patch.district = body.district === null ? null : body.district.trim() || null;
  if (body.distance_to_road_m !== undefined) patch.distance_to_road_m = body.distance_to_road_m;
  if (body.lat !== undefined)                patch.lat = body.lat;
  if (body.lng !== undefined)                patch.lng = body.lng;
  if (body.status !== undefined)             patch.status = body.status;

  // Photos: atomic replacement via RPC. Pre-normalize positions to 0..N-1 so the
  // cover ends up at position 0 regardless of client-sent values; the RPC trusts
  // what we send.
  if (body.photos !== undefined) {
    const photosPayload = body.photos
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p, idx) => ({
        url: p.url,
        storage_path: p.storage_path,
        position: idx,
      }));
    const { error: rpcErr } = await sb.rpc('replace_property_photos', {
      p_property_id: body.id,
      p_photos: photosPayload,
    });
    if (rpcErr) {
      console.error('[property-update] replace_property_photos error:', rpcErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur mise à jour photos');
    }
  }

  const { error } = await sb.from('properties').update(patch).eq('id', body.id);
  if (error) {
    console.error('[property-update] update error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur mise à jour');
  }

  // Read back via the view + ordered photo URLs for the response shape.
  const { data: prop, error: propErr } = await sb
    .from('properties_with_cover')
    .select('id, owner_id, shop_id, type, title, description, price_minor, per_month, bedrooms, area_sqm, furnished, amenities, city, district, distance_to_road_m, lat, lng, video_url, status, view_count, fav_count, created_at')
    .eq('id', body.id).single();
  if (propErr || !prop) {
    console.error('[property-update] fetch error:', propErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture annonce');
  }
  const { data: photoRows2, error: photoErr } = await sb
    .from('property_photos').select('url').eq('property_id', body.id).order('position', { ascending: true });
  if (photoErr) {
    console.error('[property-update] photos fetch error:', photoErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture photos');
  }
  const photoUrls = (photoRows2 ?? []).map((p) => p.url as string);
  return { body: { property: mapProperty(prop as PropertyRow, photoUrls) } };
}));
