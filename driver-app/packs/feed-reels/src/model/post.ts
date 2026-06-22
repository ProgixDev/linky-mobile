import { z } from 'zod';

export const PostSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  video_url: z.string().url(),
  caption: z.string().nullable(),
  created_at: z.string(),
});
export type Post = z.infer<typeof PostSchema>;

/** A post enriched with engagement state for the feed UI. */
export type FeedPost = Post & {
  likeCount: number;
  likedByMe: boolean;
};
