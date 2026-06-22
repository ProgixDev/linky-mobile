import { z } from 'zod';

export const SearchHitSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  ref_id: z.string().uuid(),
  title: z.string(),
  body: z.string().nullable(),
  rank: z.number(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;
