import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { mapShop, type ShopRow } from '@shared/catalog.ts';

interface Cursor { created_at: string; id: string }

interface Body {
  verified_only?: boolean;
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
  if (x.verified_only !== undefined && typeof x.verified_only !== 'boolean') return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 100)) return false;
  if (x.cursor !== undefined && !validCursor(x.cursor)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/shops/list', valid, async ({ sb, body }) => {
  const verifiedOnly = body.verified_only ?? true;
  const limit = body.limit ?? 50;
  let q = sb
    .from('shops_with_counts')
    .select('id, owner_id, name, about, city, cover_url, avatar_url, verified, rating, review_count, follower_count, response_time_text, product_count, created_at');

  if (verifiedOnly) q = q.eq('verified', true);

  // Keyset cursor pagination — same pattern as list-products / list-properties.
  // NOTE: default sort flipped from rating-desc to (created_at, id) desc so the
  // cursor works reliably. Rating-based ordering would require a (rating, id)
  // cursor tuple AND tolerance for rating changes mid-pagination. Future polish:
  // a `sort: 'rated' | 'recent'` param (default 'rated') for the explore surface.
  if (body.cursor) {
    const { created_at, id } = body.cursor;
    q = q.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`);
  }

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[list-shops] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const rows = (data as ShopRow[] | null) ?? [];
  const next_cursor = rows.length === limit
    ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
    : null;
  return { body: { shops: rows.map(mapShop), next_cursor } };
}));
