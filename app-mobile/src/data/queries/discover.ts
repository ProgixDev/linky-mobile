import { useQuery } from '@tanstack/react-query';
import type { DiscoverItem } from '../types';
import { apiPost } from '../../lib/api';

export type DiscoverFilter = 'all' | 'products' | 'properties';

interface DiscoverCursor { created_at: string; id: string }

// Calls /discover-feed (live). Backend interleaves both kinds by created_at desc;
// client-side filter narrows when the caller wants only products or only properties.
// Pagination via next_cursor isn't wired yet — caller gets the first page (up to 50).
export function useDiscoverFeed(filter: DiscoverFilter = 'all') {
  return useQuery({
    queryKey: ['discover-feed', filter],
    queryFn: async (): Promise<DiscoverItem[]> => {
      const { items } = await apiPost<{ items: DiscoverItem[]; next_cursor: DiscoverCursor | null }>({
        path: '/discover-feed',
        authed: false,
        body: { limit: 50 },
      });
      if (filter === 'products') return items.filter((i) => i.kind === 'product');
      if (filter === 'properties') return items.filter((i) => i.kind === 'property');
      return items;
    },
  });
}
