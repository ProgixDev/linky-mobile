// Wired to live edge functions: list-products / get-product. Public reads (no JWT required).
// Backwards-compat: existing screens consume Product[] / Product — shape is unchanged from
// the mock contract, since the edge functions return the same camelCase shape.
import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import type { Product } from '../types';

// Hide-own-listings: list-products is public + doesn't join shops, so Product
// only carries shopId (no ownerId). We fetch the caller's shop ids and filter
// products whose shopId belongs to the caller. Visitor (no userId) → empty set
// → no filter applied. The shared queryKey 'my-shops' is cached across the
// app, so this fires once per session and re-renders other consumers cheaply.
function useMyShopIds(): Set<string> {
  const userId = useAuth((s) => s.user?.id ?? s.authUserId);
  const { data: myShops } = useQuery({
    queryKey: ['my-shops'],
    enabled: !!userId,
    queryFn: async (): Promise<{ id: string }[]> => {
      const { shops } = await apiPost<{ shops: { id: string }[] }>({ path: '/shop-get-mine', body: {} });
      return shops;
    },
  });
  return useMemo(() => new Set((myShops ?? []).map((s) => s.id)), [myShops]);
}

export interface CreateProductInput {
  shop_id?: string;
  title: string;
  description?: string;
  price_minor: number;
  category: string;
  condition: 'neuf' | 'occasion' | 'reconditionné';
  photos: string[];
  video_url?: string;
  city: string;
  district?: string;
}

export interface UpdateProductInput {
  id: string;
  title?: string;
  description?: string;
  price_minor?: number;
  category?: string;
  condition?: 'neuf' | 'occasion' | 'reconditionné';
  photos?: string[];
  video_url?: string | null;
  city?: string;
  district?: string | null;
  status?: 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
  /** Quantité disponible. `null` = non renseignée, donc aucun plafond au panier. */
  stock?: number | null;
}

export interface PhotoUploadUrl {
  upload_url: string;
  token: string;
  path: string;
  public_url: string;
  content_type: string;
}

export interface ProductFilters {
  category?: string;
  city?: string;
  query?: string;
  shopId?: string;
  /** Price ceiling in GNF (0/undefined = no filter). */
  priceMaxGnf?: number;
  /** Product condition ('neuf' | 'occasion' | 'reconditionné'). */
  condition?: string | null;
  /** 'recent' (default) pages with the keyset cursor ; 'popular' is single-page
      by design — list-products returns no cursor for view_count ordering. */
  sort?: 'recent' | 'popular';
  /** Keep the caller's OWN listings in the result. Needed wherever the list is
      not a buyer discovery feed — e.g. Favoris, where a listing the user
      explicitly hearted must show up even if they published it (client
      2026-08-05: the Favoris tabs stayed at 0 for the client's own items). */
  includeOwn?: boolean;
}

export function useProducts(filters: ProductFilters = {}) {
  const myShopIds = useMyShopIds();
  const query = useQuery({
    queryKey: ['products', filters],
    queryFn: async (): Promise<Product[]> => {
      const { products } = await apiPost<{ products: Product[] }>({
        path: '/list-products',
        authed: false,
        body: {
          category: filters.category && filters.category !== 'all' ? filters.category : undefined,
          city: filters.city || undefined,
          query: filters.query || undefined,
          shop_id: filters.shopId || undefined,
        },
      });
      return products;
    },
  });
  // Phase U.0-B1 — the hide-own-listings filter exists for BUYER feeds
  // (marche, home featured) so a seller doesn't see their own product back.
  // When a shopId is explicitly requested, the caller IS the owner asking
  // for their own products (pro/stats, ShopDashboard "Mes annonces",
  // shop preview) — stripping them here turned T.3's stats deliverable
  // into a permanent empty state AND blocked sellers from
  // pause/mark-sold/delete on the dashboard. Skip the strip when shopId
  // is explicit ; rely on the server filter alone.
  const data = useMemo(
    () =>
      filters.shopId || filters.includeOwn
        ? query.data
        : query.data?.filter((p) => !myShopIds.has(p.shopId)),
    [query.data, myShopIds, filters.shopId, filters.includeOwn],
  );
  return { ...query, data };
}

// Caller's own products across EVERY status (not just active) so sellers can see
// + re-activate paused / mark-sold listings from the dashboard. Powered by
// list-products' owner_id filter. Guards on UUID shape (pre-real-auth installs can
// leak a mock 'u_...' id which the backend validator would reject).
export function useMyProducts() {
  const userId = useAuth((s) => s.user?.id ?? s.authUserId);
  const isUuid = !!userId && /^[0-9a-f-]{36}$/i.test(userId);
  return useQuery({
    queryKey: ['my-products', userId],
    enabled: isUuid,
    queryFn: async (): Promise<Product[]> => {
      const { products } = await apiPost<{ products: Product[] }>({
        path: '/list-products',
        authed: false,
        body: { owner_id: userId },
      });
      return products;
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    enabled: !!id,
    queryFn: async (): Promise<Product | undefined> => {
      const { product } = await apiPost<{ product: Product }>({
        path: '/get-product',
        authed: false,
        body: { id },
      });
      return product;
    },
  });
}

export function usePopularProducts(limit = 4) {
  const myShopIds = useMyShopIds();
  const query = useQuery({
    queryKey: ['products-popular', limit],
    queryFn: async (): Promise<Product[]> => {
      const { products } = await apiPost<{ products: Product[] }>({
        path: '/list-products',
        authed: false,
        body: { sort: 'popular', limit },
      });
      return products;
    },
  });
  const data = useMemo(
    () => query.data?.filter((p) => !myShopIds.has(p.shopId)),
    [query.data, myShopIds],
  );
  return { ...query, data };
}

// Atomic toggle: the server returns the new state + count, so we update without refetch.
// Requires auth (the user is the favoriter); apiPost will refresh the token on 401 once.
export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const r = await apiPost<{ favorited: boolean; fav_count: number }>({
        path: '/product-favorite-toggle',
        body: { product_id: productId },
      });
      return { productId, ...r };
    },
    onSuccess: ({ productId }) => {
      qc.invalidateQueries({ queryKey: ['product', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['my-products'] });
      // Découvrir's local heart store is durable (MMKV) so it survives a
      // remount on its own, but WITHOUT this invalidation a virtualized card
      // that unmounts+remounts (scroll away and back) reseeds from the
      // feed's now-stale cached `favorited`, silently undoing the local
      // truth (client 2026-08-06 follow-up).
      qc.invalidateQueries({ queryKey: ['discover-feed'] });
      qc.invalidateQueries({ queryKey: ['discover-infinite'] });
    },
  });
}

// Seller writes — all require auth. The first product also auto-creates "Ma boutique"
// server-side, so the wizard doesn't need a separate shop-setup step.
export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const r = await apiPost<{ product: Product }>({ path: '/product-create', body: input });
      return r.product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['my-products'] });
      qc.invalidateQueries({ queryKey: ['shops'] });
      qc.invalidateQueries({ queryKey: ['my-shops'] });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateProductInput) => {
      const r = await apiPost<{ product: Product }>({ path: '/product-update', body: input });
      return r.product;
    },
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ['product', product.id] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['my-products'] });
    },
  });
}

// Convenience wrapper: status-only update with a narrower input type than
// useUpdateProduct. Invalidates the same caches.
export function useSetProductStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: 'active' | 'reserved' | 'sold' | 'paused' | 'pending' }) => {
      const r = await apiPost<{ product: Product }>({ path: '/product-update', body: input });
      return r.product;
    },
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ['product', product.id] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['my-products'] });
      qc.invalidateQueries({ queryKey: ['my-shops'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiPost<{ deleted: true }>({ path: '/product-delete', body: { id } });
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['my-products'] });
      qc.invalidateQueries({ queryKey: ['my-shops'] });
    },
  });
}

// Fire-and-forget view counter. Caller's useEffect fires this once on detail-screen
// mount; failures are swallowed so they don't block render. Public endpoint (no auth).
export function useTrackView() {
  return useMutation({
    mutationFn: async (input: { kind: 'product' | 'property'; id: string }) => {
      return apiPost<{ ok: true }>({ path: '/view-track', body: input, authed: false });
    },
  });
}

interface Cursor { created_at: string; id: string }

// Infinite-scroll variant of useProducts. queryKey embeds the filter object so
// filter changes reset to first page automatically. Caller consumes `products`
// (flat array across all loaded pages) + fetchNextPage / hasNextPage /
// isFetchingNextPage from the underlying query.
export function useProductsInfinite(filters: ProductFilters = {}) {
  const query = useInfiniteQuery({
    queryKey: ['products-infinite', filters],
    initialPageParam: undefined as Cursor | undefined,
    queryFn: async ({ pageParam }: { pageParam: Cursor | undefined }) => {
      return apiPost<{ products: Product[]; next_cursor: Cursor | null }>({
        path: '/list-products',
        authed: false,
        body: {
          category: filters.category && filters.category !== 'all' ? filters.category : undefined,
          city: filters.city || undefined,
          query: filters.query || undefined,
          shop_id: filters.shopId || undefined,
          price_max: filters.priceMaxGnf || undefined,
          condition: filters.condition || undefined,
          sort: filters.sort === 'popular' ? 'popular' : undefined,
          cursor: pageParam,
        },
      });
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  // Client 2026-08-03 — own listings MUST appear in the Marché feed (parity with
  // Découvrir : sellers want to SEE their published listings). Buying/renting your
  // OWN listing is already blocked on the detail screen (isOwn → « Modifier »
  // only), so we no longer hide-own here.
  const products = useMemo(
    () => query.data?.pages.flatMap((p) => p.products) ?? [],
    [query.data],
  );
  return { ...query, products };
}

// Returns a one-shot signed upload URL. Client PUTs the file to upload_url with the
// matching Content-Type, then puts public_url into the create-product photos[] array.
export function useRequestPhotoUploadUrl() {
  return useMutation({
    mutationFn: async (input: { kind: 'product' | 'property' | 'avatar' | 'property-video' | 'product-video'; filename: string; content_type: string }) => {
      return apiPost<PhotoUploadUrl>({ path: '/photo-upload-url', body: input });
    },
  });
}
