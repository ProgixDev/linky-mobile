import { supabase } from '@/shared/lib/supabase';

import { PostSchema, type FeedPost } from '../model/post';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const PAGE = 10;

/**
 * A page of the feed, newest first, enriched with like count + liked-by-me.
 * Cursor = the `created_at` of the last item you have. RLS: posts are public read.
 */
export async function getFeed(cursor?: string): Promise<Result<FeedPost[]>> {
  let query = supabase
    .from('posts')
    .select('id, user_id, video_url, caption, created_at, post_likes(count)')
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as Array<
    Record<string, unknown> & { post_likes?: { count: number }[] }
  >;
  const posts = rows.map((r) => PostSchema.parse(r));
  const ids = posts.map((p) => p.id);

  // Which of these the current user has liked (one query for the page).
  const me = (await supabase.auth.getUser()).data.user;
  let likedSet = new Set<string>();
  if (me && ids.length > 0) {
    const { data: likes } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', me.id)
      .in('post_id', ids);
    likedSet = new Set((likes ?? []).map((l) => l.post_id as string));
  }

  const value: FeedPost[] = posts.map((p, i) => ({
    ...p,
    likeCount: rows[i]?.post_likes?.[0]?.count ?? 0,
    likedByMe: likedSet.has(p.id),
  }));
  return { ok: true, value };
}

/** Like / unlike a post. user_id defaults to auth.uid(); RLS enforces ownership. */
export async function toggleLike(postId: string, liked: boolean): Promise<Result<null>> {
  if (liked) {
    const { error } = await supabase.from('post_likes').delete().eq('post_id', postId);
    return error ? { ok: false, error: error.message } : { ok: true, value: null };
  }
  const { error } = await supabase.from('post_likes').insert({ post_id: postId });
  return error ? { ok: false, error: error.message } : { ok: true, value: null };
}

/** Publish a post (video already uploaded to Storage or any https URL). */
export async function createPost(videoUrl: string, caption?: string): Promise<Result<string>> {
  const { data, error } = await supabase
    .from('posts')
    .insert({ video_url: videoUrl, caption: caption ?? null })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not publish.' };
  return { ok: true, value: data.id };
}
