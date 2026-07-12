// Admin — recent shop reviews across the marketplace, newest first, for the
// moderation feed. Reviewer name + shop name joined via batched Maps. Read-only;
// the delete action is admin-delete-review.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body { limit?: number }

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 200)) return false;
  return true;
}

interface Row {
  id: string; rating: number; comment: string | null; created_at: string;
  reviewer_id: string; shop_id: string;
}

Deno.serve(makePost<Body>('/v1/admin/reviews/list', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const { data, error } = await sb
    .from('reviews')
    .select('id, rating, comment, created_at, reviewer_id, shop_id')
    .order('created_at', { ascending: false })
    .limit(body.limit ?? 100);
  if (error) { console.error('[admin-list-reviews] query:', error); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  const rows = (data as Row[] | null) ?? [];

  const reviewers = new Map<string, string | null>();
  const shops = new Map<string, string | null>();
  if (rows.length > 0) {
    const uids = [...new Set(rows.map((r) => r.reviewer_id))];
    const { data: us } = await sb.from('users').select('id, display_name').in('id', uids);
    for (const u of (us as { id: string; display_name: string | null }[] | null) ?? []) reviewers.set(u.id, u.display_name);
    const sids = [...new Set(rows.map((r) => r.shop_id))];
    const { data: ss } = await sb.from('shops').select('id, name').in('id', sids);
    for (const s of (ss as { id: string; name: string | null }[] | null) ?? []) shops.set(s.id, s.name);
  }

  const reviews = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    reviewerId: r.reviewer_id,
    reviewerName: reviewers.get(r.reviewer_id) ?? null,
    shopId: r.shop_id,
    shopName: shops.get(r.shop_id) ?? null,
  }));

  return { body: { reviews } };
}));
