import { useEffect, useState } from 'react';

import { follow, followCounts, isFollowing, unfollow } from './data/follow-repo';

/**
 * Optimistic follow state for one target user. Flips the button instantly and
 * adjusts the follower count, rolling back if the write fails.
 */
export function useFollow(targetUserId: string) {
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [f, counts] = await Promise.all([isFollowing(targetUserId), followCounts(targetUserId)]);
      setFollowing(f);
      setFollowers(counts.followers);
    })();
  }, [targetUserId]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    setFollowers((c) => c + (next ? 1 : -1));

    const r = next ? await follow(targetUserId) : await unfollow(targetUserId);
    if (!r.ok) {
      // Roll back on failure.
      setFollowing(!next);
      setFollowers((c) => c + (next ? -1 : 1));
    }
    setBusy(false);
  };

  return { following, followers, busy, toggle };
}
