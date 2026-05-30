// Wired to live edge functions: list-products / get-product. Public reads (no JWT required).
// Backwards-compat: existing screens consume Product[] / Product — shape is unchanged from
// the mock contract, since the edge functions return the same camelCase shape.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Product } from '../types';

export interface CreateProductInput {
  shop_id?: string;
  title: string;
  description?: string;
  price_minor: number;
  category: string;
  condition: 'neuf' | 'occasion' | 'reconditionné';
  photos: string[];
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
  city?: string;
  district?: string | null;
  status?: 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
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
  query?: string;
  shopId?: string;
}

export function useProducts(filters: ProductFilters = {}) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: async (): Promise<Product[]> => {
      const { products } = await apiPost<{ products: Product[] }>({
        path: '/list-products',
        authed: false,
        body: {
          category: filters.category && filters.category !== 'all' ? filters.category : undefined,
          query: filters.query || undefined,
          shop_id: filters.shopId || undefined,
        },
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
  return useQuery({
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

// Returns a one-shot signed upload URL. Client PUTs the file to upload_url with the
// matching Content-Type, then puts public_url into the create-product photos[] array.
export function useRequestPhotoUploadUrl() {
  return useMutation({
    mutationFn: async (input: { kind: 'product' | 'property'; filename: string; content_type: string }) => {
      return apiPost<PhotoUploadUrl>({ path: '/photo-upload-url', body: input });
    },
  });
}
