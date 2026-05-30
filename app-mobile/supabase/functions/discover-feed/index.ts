// Discover feed — public read, interleaves the most recent active products and active
// properties chronologically. Returns DiscoverItem[] matching src/data/types.ts so the
// existing Découvrir screen consumes the response without translation. Pagination is
// keyset on (created_at desc, id desc); same cursor pattern as list-products /
// list-properties.
//
// Merge strategy: over-fetch `limit` rows from each side, merge by (created_at, id)
// desc, slice to `limit`. The cursor (when present) is applied to both sides so
// subsequent pages can't return rows we've already shown.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import {
  mapProduct,
  mapProperty,
  type ProductRow,
  type PropertyRow,
} from '@shared/catalog.ts';

interface Cursor { created_at: string; id: string }
interface Body { limit?: number; cursor?: Cursor }

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function validCursor(c: unknown): c is Cursor {
  if (typeof c !== 'object' || c === null) return false;
  const x = c as Record<string, unknown>;
  if (typeof x.created_at !== 'string' || !ISO_RE.test(x.created_at)) return false;
  if (typeof x.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.id)) return false;
  return true;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 50)) return false;
  if (x.cursor !== undefined && !validCursor(x.cursor)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/discover/feed', valid, async ({ sb, body }) => {
  const limit = body.limit ?? 20;
  const sideLimit = limit;

  let productsQ = sb
    .from('products')
    .select('id, shop_id, title, description, price_minor, category, condition, status, photos, boosted, view_count, fav_count, city, district, created_at')
    .eq('status', 'active');

  let propertiesQ = sb
    .from('properties_with_cover')
    .select('id, owner_id, shop_id, type, title, description, price_minor, per_month, bedrooms, area_sqm, furnished, amenities, city, district, distance_to_road_m, lat, lng, video_url, status, view_count, fav_count, created_at, cover_url')
    .eq('status', 'active');

  if (body.cursor) {
    const { created_at, id } = body.cursor;
    const cursorFilter = `created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`;
    productsQ = productsQ.or(cursorFilter);
    propertiesQ = propertiesQ.or(cursorFilter);
  }

  const [productsRes, propertiesRes] = await Promise.all([
    productsQ.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(sideLimit),
    propertiesQ.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(sideLimit),
  ]);

  if (productsRes.error) {
    console.error('[discover-feed] products error:', productsRes.error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (propertiesRes.error) {
    console.error('[discover-feed] properties error:', propertiesRes.error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const productRows = (productsRes.data as ProductRow[] | null) ?? [];
  const propertyRows = (propertiesRes.data as (PropertyRow & { cover_url: string | null })[] | null) ?? [];

  type MergedItem = {
    kind: 'product' | 'property';
    item: ReturnType<typeof mapProduct> | ReturnType<typeof mapProperty>;
    created_at: string;
    id: string;
  };

  const merged: MergedItem[] = [
    ...productRows.map((r) => ({
      kind: 'product' as const,
      item: mapProduct(r),
      created_at: r.created_at,
      id: r.id,
    })),
    ...propertyRows.map((r) => ({
      kind: 'property' as const,
      item: mapProperty(r, r.cover_url ? [r.cover_url] : []),
      created_at: r.created_at,
      id: r.id,
    })),
  ];

  merged.sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });

  const sliced = merged.slice(0, limit);
  const next_cursor = sliced.length === limit
    ? { created_at: sliced[sliced.length - 1].created_at, id: sliced[sliced.length - 1].id }
    : null;

  return {
    body: {
      items: sliced.map(({ kind, item }) => ({ kind, item })),
      next_cursor,
    },
  };
}));
