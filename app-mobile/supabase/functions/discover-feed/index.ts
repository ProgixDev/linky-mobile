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
// Optional auth: the feed stays public, but a signed-in caller also gets their
// own heart state per item (never throws on a missing/expired token).
import { tryGetUser } from '@shared/auth.ts';
import {
  mapProduct,
  mapProperty,
  type ProductRow,
  type PropertyRow,
} from '@shared/catalog.ts';

interface Cursor { created_at: string; id: string }
interface Body { limit?: number; cursor?: Cursor }

// Phase V.2 -- anchored. Pre-V2 the trailing $ was missing ; cursor
// created_at flows into PostgREST .or() filter strings (contained today
// by the ANDed user-id filter, harden anyway).
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

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

Deno.serve(makePost<Body>('/v1/discover/feed', valid, async ({ sb, body, req }) => {
  const limit = body.limit ?? 20;
  const sideLimit = limit;

  let productsQ = sb
    .from('products')
    .select('id, shop_id, title, description, price_minor, category, condition, status, photos, video_url, boosted, view_count, fav_count, city, district, created_at')
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

  // Comment counts for the returned items (client 2026-08-03 — the reel showed a
  // like count but no comment count). Computed on the fly : listing_id is a UUID
  // (globally unique across products/properties) so a single `in` query is
  // unambiguous. V1.1 : denormalize a comment_count column if volumes grow.
  const ids = sliced.map((m) => m.id);
  const commentCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: crows, error: cErr } = await sb
      .from('comments')
      .select('listing_id')
      .in('listing_id', ids);
    if (cErr) console.error('[discover-feed] comment count error:', cErr);
    for (const c of (crows as { listing_id: string }[] | null) ?? []) {
      commentCounts.set(c.listing_id, (commentCounts.get(c.listing_id) ?? 0) + 1);
    }
  }

  // Whether the CALLER has hearted each item. Until now the reel read this from
  // a device-local store while the count came from the server, so the two drifted
  // apart (a stale local heart + a server count of 0 rendered « -1 » on untap —
  // client 2026-08-05). Serving both from the same source keeps them consistent
  // across reinstalls, devices and failed requests. Anonymous callers get false.
  const favorited = new Set<string>();
  const viewerId = await tryGetUser(req);
  if (viewerId && ids.length > 0) {
    const productIds = sliced.filter((m) => m.kind === 'product').map((m) => m.id);
    const propertyIds = sliced.filter((m) => m.kind === 'property').map((m) => m.id);
    const [pf, rf] = await Promise.all([
      productIds.length
        ? sb.from('product_favorites').select('product_id').eq('user_id', viewerId).in('product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
      propertyIds.length
        ? sb.from('property_favorites').select('property_id').eq('user_id', viewerId).in('property_id', propertyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (pf.error) console.error('[discover-feed] product favorites error:', pf.error);
    if (rf.error) console.error('[discover-feed] property favorites error:', rf.error);
    for (const r of (pf.data as { product_id: string }[] | null) ?? []) favorited.add(r.product_id);
    for (const r of (rf.data as { property_id: string }[] | null) ?? []) favorited.add(r.property_id);
  }

  // « Recommandations personnalisées » (client 2026-08-06). No per-user view
  // history exists (view-track is an anonymous aggregate counter), so the
  // only honest signal available is what the caller has actively FAVORITED —
  // matches the setting's promise ("adapte votre feed à vos goûts") without
  // pretending to run a recommendation engine that doesn't exist.
  //
  // Presentation only : `presented` reorders a COPY of `sliced` for display.
  // `next_cursor` is computed from `sliced` (untouched, true chronological
  // order) BEFORE this runs — re-ranking the page must never shift the
  // pagination watermark, or the next page could skip or repeat items.
  let presented = sliced;
  if (viewerId) {
    const { data: prefRow } = await sb.from('users').select('personalize_feed').eq('id', viewerId).maybeSingle();
    const personalize = (prefRow as { personalize_feed?: boolean } | null)?.personalize_feed !== false;
    if (personalize) {
      const [favProducts, favProperties] = await Promise.all([
        sb.from('product_favorites').select('products(category)').eq('user_id', viewerId),
        sb.from('property_favorites').select('properties(type, city)').eq('user_id', viewerId),
      ]);
      const favCategories = new Set<string>();
      for (const r of (favProducts.data as { products: { category: string } | null }[] | null) ?? []) {
        if (r.products?.category) favCategories.add(r.products.category);
      }
      const favTypes = new Set<string>();
      const favCities = new Set<string>();
      for (const r of (favProperties.data as { properties: { type: string; city: string } | null }[] | null) ?? []) {
        if (r.properties?.type) favTypes.add(r.properties.type);
        if (r.properties?.city) favCities.add(r.properties.city);
      }
      if (favCategories.size > 0 || favTypes.size > 0 || favCities.size > 0) {
        const scoreOf = (m: MergedItem): number => {
          if (m.kind === 'product') {
            const row = productRows.find((p) => p.id === m.id);
            return row && favCategories.has(row.category) ? 2 : 0;
          }
          const row = propertyRows.find((p) => p.id === m.id);
          if (!row) return 0;
          let s = 0;
          if (favTypes.has(row.type)) s += 2;
          if (favCities.has(row.city)) s += 1;
          return s;
        };
        // Array.prototype.sort is stable (ES2019+/Deno) : items with an equal
        // score keep their original chronological relative order, so this is
        // purely a nudge, never a full reshuffle.
        presented = [...sliced].sort((a, b) => scoreOf(b) - scoreOf(a));
      }
    }
  }

  return {
    body: {
      items: presented.map(({ kind, item, id }) => ({
        kind,
        item: {
          ...item,
          commentCount: commentCounts.get(id) ?? 0,
          favorited: favorited.has(id),
        },
      })),
      next_cursor,
    },
  };
}));
