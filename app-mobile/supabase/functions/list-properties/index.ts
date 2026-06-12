// List active properties. Public read (no JWT). Returns one row per property with
// cover_url folded into photos: [coverUrl] (or [] when no photos) — full photo arrays
// are fetched on the detail screen via get-property. Pagination is keyset on
// (created_at DESC, id DESC) so the same property doesn't repeat across pages even
// under write pressure. Filters live in the request body; the frontend hook translates
// its rooms-string into bedrooms_min/bedrooms_max before calling.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { mapProperty, type PropertyRow } from '@shared/catalog.ts';

interface Cursor { created_at: string; id: string }

interface Body {
  type?: 'location' | 'vente' | 'terrain';
  city?: string;
  owner_id?: string;
  bedrooms_min?: number;
  bedrooms_max?: number;
  price_min?: number;
  price_max?: number;
  distance_max?: number;
  furnished?: boolean;
  query?: string;
  limit?: number;
  cursor?: Cursor;
}

const TYPES = new Set(['location', 'vente', 'terrain']);
// Phase V.2 -- anchored. See discover-feed for the rationale.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
}

function validCursor(c: unknown): c is Cursor {
  if (typeof c !== 'object' || c === null) return false;
  const x = c as Record<string, unknown>;
  if (typeof x.created_at !== 'string' || !ISO_RE.test(x.created_at)) return false;
  if (!isUuid(x.id)) return false;
  return true;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.type !== undefined && (typeof x.type !== 'string' || !TYPES.has(x.type as string))) return false;
  if (x.city !== undefined && (typeof x.city !== 'string' || x.city.length > 80)) return false;
  if (x.owner_id !== undefined && (typeof x.owner_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.owner_id))) return false;
  if (x.bedrooms_min !== undefined && (typeof x.bedrooms_min !== 'number' || !Number.isInteger(x.bedrooms_min) || x.bedrooms_min < 0 || x.bedrooms_min > 50)) return false;
  if (x.bedrooms_max !== undefined && (typeof x.bedrooms_max !== 'number' || !Number.isInteger(x.bedrooms_max) || x.bedrooms_max < 0 || x.bedrooms_max > 50)) return false;
  if (x.price_min !== undefined && (typeof x.price_min !== 'number' || !Number.isInteger(x.price_min) || x.price_min < 0)) return false;
  if (x.price_max !== undefined && (typeof x.price_max !== 'number' || !Number.isInteger(x.price_max) || x.price_max < 0)) return false;
  if (x.distance_max !== undefined && (typeof x.distance_max !== 'number' || !Number.isInteger(x.distance_max) || x.distance_max < 0 || x.distance_max > 50_000)) return false;
  if (x.furnished !== undefined && typeof x.furnished !== 'boolean') return false;
  if (x.query !== undefined && (typeof x.query !== 'string' || x.query.length > 200)) return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 100)) return false;
  if (x.cursor !== undefined && !validCursor(x.cursor)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/properties/list', valid, async ({ sb, body }) => {
  const limit = body.limit ?? 50;
  let q = sb
    .from('properties_with_cover')
    .select('id, owner_id, shop_id, type, title, description, price_minor, per_month, bedrooms, area_sqm, furnished, amenities, city, district, distance_to_road_m, lat, lng, video_url, status, view_count, fav_count, created_at, cover_url');

  // When the caller asks for their own listings, surface every status so they can
  // manage paused/reserved/sold. Public reads (no owner_id) stay active-only.
  if (!body.owner_id) q = q.eq('status', 'active');

  if (body.type)                       q = q.eq('type', body.type);
  if (body.city)                       q = q.eq('city', body.city);
  if (body.owner_id)                   q = q.eq('owner_id', body.owner_id);
  if (body.bedrooms_min !== undefined) q = q.gte('bedrooms', body.bedrooms_min);
  if (body.bedrooms_max !== undefined) q = q.lte('bedrooms', body.bedrooms_max);
  if (body.price_min !== undefined)    q = q.gte('price_minor', body.price_min);
  if (body.price_max !== undefined)    q = q.lte('price_minor', body.price_max);
  if (body.distance_max !== undefined) q = q.lte('distance_to_road_m', body.distance_max);
  if (body.furnished !== undefined)    q = q.eq('furnished', body.furnished);

  if (body.query) {
    // ILIKE on title + description; escape % and , to prevent users from broadening
    // their own query by injecting wildcards or breaking the .or() filter syntax.
    const safe = body.query.replace(/[%,]/g, ' ');
    q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  // Keyset cursor: in descending order, the next page contains rows whose
  // (created_at, id) lexicographically precedes the cursor's. Composed via PostgREST
  // .or() with a nested .and() for the same-millisecond tiebreaker.
  if (body.cursor) {
    const { created_at, id } = body.cursor;
    q = q.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`);
  }

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[list-properties] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data as (PropertyRow & { cover_url: string | null })[] | null) ?? [];
  const properties = rows.map((r) => mapProperty(r, r.cover_url ? [r.cover_url] : []));

  const next_cursor = rows.length === limit
    ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
    : null;

  return { body: { properties, next_cursor } };
}));
