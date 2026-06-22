import { useCallback, useEffect, useState } from 'react';

import { getFeed, toggleLike } from './data/feed-repo';
import { type FeedPost } from './model/post';

/**
 * The reels feed: paginated load (cursor on created_at), pull-to-refresh,
 * optimistic like/unlike with revert, and the active (visible) index so the UI
 * plays only the on-screen video. The screen maps `posts` + reads `activeIndex`.
 */
export function useFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const load = useCallback(async (cursor?: string) => {
    const r = await getFeed(cursor);
    if (r.ok) {
      setPosts((prev) => (cursor ? [...prev, ...r.value] : r.value));
      if (r.value.length < 10) setDone(true);
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const loadMore = useCallback(async () => {
    if (done || posts.length === 0) return;
    const last = posts[posts.length - 1];
    if (last) await load(last.created_at);
  }, [done, posts, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setDone(false);
    await load();
    setRefreshing(false);
  }, [load]);

  const like = useCallback(
    async (postId: string) => {
      const target = posts.find((p) => p.id === postId);
      if (!target) return;
      const wasLiked = target.likedByMe;
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, likedByMe: !wasLiked, likeCount: p.likeCount + (wasLiked ? -1 : 1) }
            : p,
        ),
      );
      const r = await toggleLike(postId, wasLiked);
      if (!r.ok) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, likedByMe: wasLiked, likeCount: target.likeCount } : p,
          ),
        );
      }
    },
    [posts],
  );

  return { posts, loading, refreshing, activeIndex, setActiveIndex, loadMore, refresh, like };
}
