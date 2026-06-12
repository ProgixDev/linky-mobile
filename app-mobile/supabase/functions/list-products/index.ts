import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { mapProduct, type ProductRow } from '@shared/catalog.ts';

interface Cursor { created_at: string; id: string }

interface Body {
  category?: string;
  query?: string;
  shop_id?: string;
  sort?: 'recent' | 'popular';
  limit?: number;
  cursor?: Cursor;
}

// Phase V.2 -- anchored. See discover-feed for the rationale.
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
  if (x.category !== undefined && typeof x.category !== 'string') return false;
  if (x.query !== undefined && typeof x.query !== 'string') return false;
  if (x.shop_id !== undefined && (typeof x.shop_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.shop_id))) return false;
  if (x.sort !== undefined && x.sort !== 'recent' && x.sort !== 'popular') return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 100)) return false;
  if (x.cursor !== undefined && !validCursor(x.cursor)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/products/list', valid, async ({ sb, body }) => {
  const limit = body.limit ?? 50;
  const sortIsRecent = !body.sort || body.sort === 'recent';
  let q = sb
    .from('products')
    .select('id, shop_id, title, description, price_minor, category, condition, status, photos, boosted, view_count, fav_count, city, district, created_at')
    .eq('status', 'active');

  if (body.category && body.category !== 'all') q = q.eq('category', body.category);
  if (body.shop_id) q = q.eq('shop_id', body.shop_id);
  if (body.query) {
    // V1 text search: ILIKE on title + description. .or() with comma syntax. Escape % and , to
    // prevent users from broadening their own query by injecting wildcards or breaking the filter.
    const safe = body.query.replace(/[%,]/g, ' ');
    q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  // Keyset cursor only valid with recent sort — popular sorts by view_count which is
  // mutable, so a stable keyset would need a (view_count, id) tuple. Out of scope.
  if (body.cursor && sortIsRecent) {
    const { created_at, id } = body.cursor;
    q = q.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`);
  }

  if (body.sort === 'popular') q = q.order('view_count', { ascending: false });
  else q = q.order('created_at', { ascending: false }).order('id', { ascending: false });

  const { data, error } = await q.limit(limit);
  if (error) {
    console.error('[list-products] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const rows = (data as ProductRow[] | null) ?? [];
  const next_cursor = sortIsRecent && rows.length === limit
    ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
    : null;
  return { body: { products: rows.map(mapProduct), next_cursor } };
}));
