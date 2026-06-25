// Create a new shop or update one the caller already owns. With no id => create.
// With id => update if owned by the caller (404 otherwise). Verified/rating/counts
// are not editable by sellers; admin endpoints control those.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapShop, type ShopRow } from '@shared/catalog.ts';

interface Body {
  id?: string;
  name: string;
  city: string;
  about?: string;
  cover_url?: string | null;
  avatar_url?: string | null;
  // Exact shop point picked on the map; overrides the city centroid default.
  lat?: number | null;
  lng?: number | null;
}

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
}

// A finite coordinate within bounds, OR null/undefined (clear / not set).
function isCoord(v: unknown, max: number): boolean {
  return v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && v >= -max && v <= max);
}

// Shop cover/avatar must be a clean https URL inside OUR Supabase storage
// (any public bucket) — blocks a crafted request from injecting an arbitrary
// external or data: image that would then render on the shop page for everyone.
function isOwnStorageUrl(v: string): boolean {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) return false;
  let url: URL;
  let base: URL;
  try {
    url = new URL(v);
    base = new URL(supabaseUrl);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.host === base.host &&
    url.search === '' &&
    url.hash === '' &&
    url.pathname.startsWith('/storage/v1/object/public/')
  );
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.id !== undefined && !isUuid(x.id)) return false;
  if (typeof x.name !== 'string' || x.name.trim().length < 2 || x.name.length > 80) return false;
  if (typeof x.city !== 'string' || x.city.trim().length < 2 || x.city.length > 80) return false;
  if (x.about !== undefined && (typeof x.about !== 'string' || x.about.length > 800)) return false;
  if (x.cover_url !== undefined && x.cover_url !== null && (typeof x.cover_url !== 'string' || x.cover_url.length > 500)) return false;
  if (x.avatar_url !== undefined && x.avatar_url !== null && (typeof x.avatar_url !== 'string' || x.avatar_url.length > 500)) return false;
  if (!isCoord(x.lat, 90)) return false;
  if (!isCoord(x.lng, 180)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/shops/upsert', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  // Reject externally-hosted cover/avatar images (only our storage is allowed).
  if (body.cover_url != null && body.cover_url !== '' && !isOwnStorageUrl(body.cover_url)) {
    throwApi('INVALID_BODY', 400, 'Image de couverture invalide');
  }
  if (body.avatar_url != null && body.avatar_url !== '' && !isOwnStorageUrl(body.avatar_url)) {
    throwApi('INVALID_BODY', 400, 'Logo invalide');
  }
  const payload = {
    owner_id: userId,
    name: body.name.trim(),
    city: body.city.trim(),
    about: body.about?.trim() ?? '',
    cover_url: body.cover_url ?? null,
    avatar_url: body.avatar_url ?? null,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    updated_at: new Date().toISOString(),
  };

  // On UPDATE, only touch lat/lng when the client actually sent them — a partial
  // edit (e.g. just the name) must NOT wipe a previously-picked exact point back to
  // the city centroid. INSERT always sets them (null → the geo trigger fills the centroid).
  const updateFields: Record<string, unknown> = {
    name: payload.name,
    city: payload.city,
    about: payload.about,
    cover_url: payload.cover_url,
    avatar_url: payload.avatar_url,
    updated_at: payload.updated_at,
  };
  if (body.lat !== undefined) updateFields.lat = body.lat;
  if (body.lng !== undefined) updateFields.lng = body.lng;

  let row: ShopRow | null = null;
  if (body.id) {
    // Update only if caller owns it. The composite filter both finds and authorizes.
    const { data, error } = await sb
      .from('shops')
      .update(updateFields)
      .eq('id', body.id)
      .eq('owner_id', userId)
      .select('*')
      .maybeSingle();
    if (error) { console.error('[shop-upsert] update error:', error); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
    if (!data) throwApi('SHOP_NOT_FOUND', 404, 'Boutique introuvable.');
    row = data as ShopRow;
  } else {
    const { data, error } = await sb
      .from('shops')
      .insert(payload)
      .select('*')
      .single();
    if (error) { console.error('[shop-upsert] insert error:', error); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
    row = data as ShopRow;
  }

  // Pull the joined view so product_count is included in the response.
  const { data: withCounts } = await sb
    .from('shops_with_counts')
    .select('id, owner_id, name, about, city, cover_url, avatar_url, verified, rating, review_count, follower_count, response_time_text, product_count')
    .eq('id', row!.id)
    .single();
  return { body: { shop: mapShop((withCounts ?? row) as ShopRow) } };
}));
