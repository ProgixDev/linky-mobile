import { useCallback, useEffect, useState } from 'react';

import { getSummary, listReviews, submitReview } from './data/reviews-repo';
import { NewReviewSchema, type Review, type ReviewSummary } from './model/review';

/**
 * Reviews for one entity: the average summary, the list, and a submit action
 * (upsert — one review per user). Refreshes the summary after a submit.
 */
export function useReviews(entityType: string, entityId: string) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary>({ avg_rating: 0, review_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, sum] = await Promise.all([
      listReviews(entityType, entityId),
      getSummary(entityType, entityId),
    ]);
    if (list.ok) setReviews(list.value);
    setSummary(sum);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (rating: number, body?: string) => {
    const parsed = NewReviewSchema.safeParse({ rating, body });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid');
      return false;
    }
    setError(null);
    const r = await submitReview(entityType, entityId, rating, body);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    await load();
    return true;
  };

  return { reviews, summary, loading, error, submit, reload: load };
}
