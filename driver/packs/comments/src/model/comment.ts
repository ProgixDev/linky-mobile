import { z } from 'zod';

export const CommentSchema = z.object({
  id: z.string().uuid(),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  user_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable(),
  body: z.string().min(1).max(4000),
  created_at: z.string(),
});
export type Comment = z.infer<typeof CommentSchema>;

/** Validated input for posting (trimmed, length-bounded to match the DB check). */
export const NewCommentSchema = z.object({
  body: z.string().trim().min(1, 'Say something').max(4000),
  parentId: z.string().uuid().nullable().optional(),
});
