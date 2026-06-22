import { useEffect, useState } from 'react';

import { drainQueue, pendingCount, subscribePending } from './mutation-queue';
import { useNetworkState } from './use-network-state';

/**
 * Mount once near the root. Tracks the pending-write count and automatically
 * drains the queue whenever connectivity returns. Returns `{ isOnline, pending }`
 * so you can render an "N changes will sync" banner.
 */
export function useOfflineQueue() {
  const { isOnline } = useNetworkState();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void pendingCount().then(setPending);
    return subscribePending(setPending);
  }, []);

  useEffect(() => {
    if (isOnline) void drainQueue();
  }, [isOnline]);

  return { isOnline, pending };
}
