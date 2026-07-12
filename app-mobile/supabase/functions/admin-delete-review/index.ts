// Admin — delete an abusive shop review, then recompute the shop's denormalized
// rating + review_count from its remaining reviews (mirrors create-review's
// recompute). Audit row per deletion.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body { review_id: string; reason?: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.review_id !== 'string' || !UUID_RE.test(x.review_id)) return false;
  if (x.reason !== undefined && (typeof x.reason !== 'string' || x.reason.length > 500)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/admin/reviews/delete', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const { data: r, error: eR } = await sb
    .from('reviews')
    .select('id, shop_id, reviewer_id, rating, comment')
    .eq('id', body.review_id)
    .maybeSingle();
  if (eR) { console.error('[admin-delete-review] lookup:', eR); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!r) throwApi('REVIEW_NOT_FOUND', 404, 'Avis introuvable.');
  const shopId = (r as { shop_id: string }).shop_id;

  const { error: dErr } = await sb.from('reviews').delete().eq('id', body.review_id);
  if (dErr) { console.error('[admin-delete-review] delete:', dErr); throwApi('INTERNAL_ERROR', 500, 'Erreur suppression'); }

  // Recompute the shop's denormalized rating + count from the survivors.
  const { data: rows } = await sb.from('reviews').select('rating').eq('shop_id', shopId);
  const ratings = ((rows as { rating: number }[] | null) ?? []).map((x) => x.rating);
  const count = ratings.length;
  const avg = count ? Math.round((ratings.reduce((a, b) => a + b, 0) / count) * 10) / 10 : 0;
  await sb.from('shops').update({ rating: avg, review_count: count }).eq('id', shopId);

  const { error: auditErr } = await sb.from('admin_actions').insert({
    admin_id: adminId,
    target_type: 'review',
    target_id: body.review_id,
    action: 'review.delete',
    reason: body.reason?.trim() || null,
    metadata: {
      shop_id: shopId,
      reviewer_id: (r as { reviewer_id?: string }).reviewer_id ?? null,
      rating: (r as { rating?: number }).rating ?? null,
      comment: String((r as { comment?: string | null }).comment ?? '').slice(0, 200),
    },
    before_snapshot: { existed: true },
    after_snapshot: { deleted: true, shop_rating: avg, shop_review_count: count },
  });
  if (auditErr) console.error('[admin-delete-review] audit insert failed:', auditErr);

  return { body: { ok: true, shopRating: avg, shopReviewCount: count } };
}));
