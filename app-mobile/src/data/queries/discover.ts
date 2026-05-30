import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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

// Infinite-scroll variant. Filter is applied client-side (backend doesn't accept
// `kind`) so the cursor stays page-stable — the server returns mixed items each
// page and the client narrows. Tradeoff: when filter='products', some pages might
// contain mostly properties and yield few visible rows. Acceptable for V1 volume.
export function useDiscoverInfinite(filter: DiscoverFilter = 'all') {
  const query = useInfiniteQuery({
    queryKey: ['discover-infinite', filter],
    initialPageParam: undefined as DiscoverCursor | undefined,
    queryFn: async ({ pageParam }: { pageParam: DiscoverCursor | undefined }) => {
      return apiPost<{ items: DiscoverItem[]; next_cursor: DiscoverCursor | null }>({
        path: '/discover-feed',
        authed: false,
        body: { limit: 20, cursor: pageParam },
      });
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const rawItems = query.data?.pages.flatMap((p) => p.items) ?? [];
  const items =
    filter === 'products' ? rawItems.filter((i) => i.kind === 'product')
    : filter === 'properties' ? rawItems.filter((i) => i.kind === 'property')
    : rawItems;

  return { ...query, items };
}
