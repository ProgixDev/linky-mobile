import { supabase } from '@/shared/lib/supabase';

import {
  ReviewSchema,
  ReviewSummarySchema,
  type Review,
  type ReviewSummary,
} from '../model/review';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Reviews for an entity, newest first (public read). */
export async function listReviews(entityType: string, entityId: string): Promise<Result<Review[]>> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, entity_type, entity_id, user_id, rating, body, created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data ?? []).map((r) => ReviewSchema.parse(r)) };
}

/** Average rating + count for an entity (via the review_summary RPC). */
export async function getSummary(entityType: string, entityId: string): Promise<ReviewSummary> {
  const { data } = await supabase.rpc('review_summary', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  const parsed = ReviewSummarySchema.safeParse(row ?? {});
  return parsed.success ? parsed.value : { avg_rating: 0, review_count: 0 };
}

/** Submit (or update) the current user's review — one per entity via upsert. */
export async function submitReview(
  entityType: string,
  entityId: string,
  rating: number,
  body?: string,
): Promise<Result<Review>> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { ok: false, error: 'Not signed in.' };
  const { data, error } = await supabase
    .from('reviews')
    .upsert(
      {
        entity_type: entityType,
        entity_id: entityId,
        user_id: me.id,
        rating,
        body: body ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'entity_type,entity_id,user_id' },
    )
    .select('id, entity_type, entity_id, user_id, rating, body, created_at')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not save review.' };
  return { ok: true, value: ReviewSchema.parse(data) };
}
