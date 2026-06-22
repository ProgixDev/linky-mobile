import { z } from 'zod';

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  user_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().nullable(),
  created_at: z.string(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const ReviewSummarySchema = z.object({
  avg_rating: z.coerce.number(),
  review_count: z.coerce.number(),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

/** Validated submit input. */
export const NewReviewSchema = z.object({
  rating: z.number().int().min(1, 'Pick a rating').max(5),
  body: z.string().trim().max(4000).optional(),
});
