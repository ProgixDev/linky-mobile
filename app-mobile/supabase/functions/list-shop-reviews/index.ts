// A shop's reviews, newest first, for the shop page. Authed (requireUser — the app is
// authed; no PII beyond the reviewer's display name). Reviewer names are looked up in a
// second query to avoid the two-FK-to-users PostgREST join ambiguity (reviewer_id +
// seller_id both reference users).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  shop_id: string;
  limit?: number;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.shop_id !== 'string' || !UUID_RE.test(x.shop_id)) return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 50)) {
    return false;
  }
  return true;
}

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_id: string;
}

Deno.serve(makePost<Body>('/v1/reviews/list-shop', valid, async ({ sb, body, req }) => {
  await requireUser(req);
  const limit = body.limit ?? 20;

  const { data, error } = await sb
    .from('reviews')
    .select('id, rating, comment, created_at, reviewer_id')
    .eq('shop_id', body.shop_id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[list-shop-reviews] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const rows = (data as ReviewRow[] | null) ?? [];

  const nameById = new Map<string, string | null>();
  if (rows.length > 0) {
    const ids = [...new Set(rows.map((r) => r.reviewer_id))];
    const { data: users } = await sb.from('users').select('id, display_name').in('id', ids);
    for (const u of (users as { id: string; display_name: string | null }[] | null) ?? []) {
      nameById.set(u.id, u.display_name);
    }
  }

  const reviews = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    reviewerName: nameById.get(r.reviewer_id) ?? null,
  }));

  return { body: { reviews } };
}));
