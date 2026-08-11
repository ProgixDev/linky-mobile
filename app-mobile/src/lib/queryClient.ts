import { QueryClient } from '@tanstack/react-query';

// Single app-wide QueryClient (module singleton), created here rather than in
// app/_layout.tsx so NON-React code can reach it — specifically the auth store's
// signOut, which must CLEAR the cache on account switch. Otherwise the previous
// account's cached data (listing counts, wallet, shops, orders…) leaks into the
// next account: a fresh account showed "8 annonces actives" with no listings
// because the count came from the account signed in before it (client 2026-07-30).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: 3,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});
