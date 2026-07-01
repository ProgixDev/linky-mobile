// Wired to live edge functions: list-shops / get-shop. Public reads (no JWT required).
// Returns shops_with_counts (includes productCount), so the shape is unchanged from the mock.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Shop } from '../types';

export interface UpsertShopInput {
  id?: string;
  name: string;
  city: string;
  about?: string;
  cover_url?: string | null;
  avatar_url?: string | null;
  /** Exact shop point picked on the map; overrides the city centroid default. */
  lat?: number | null;
  lng?: number | null;
  /** Opening schedule (snake_case wire shape). null clears it. */
  opening_hours?: {
    always_open: boolean;
    days: string[];
    open: string;
    close: string;
  } | null;
}

export function useShops(limit?: number) {
  return useQuery({
    queryKey: ['shops', limit],
    queryFn: async (): Promise<Shop[]> => {
      const { shops } = await apiPost<{ shops: Shop[]; next_cursor: { created_at: string; id: string } | null }>({
        path: '/list-shops',
        authed: false,
        body: { verified_only: true, ...(typeof limit === 'number' ? { limit } : {}) },
      });
      return shops;
    },
  });
}

export function useShop(id: string | undefined) {
  return useQuery({
    queryKey: ['shop', id],
    enabled: !!id,
    queryFn: async (): Promise<Shop | undefined> => {
      const { shop } = await apiPost<{ shop: Shop }>({
        path: '/get-shop',
        authed: false,
        body: { id },
      });
      return shop;
    },
  });
}

// Authed seller helpers.
export function useMyShops() {
  return useQuery({
    queryKey: ['my-shops'],
    queryFn: async (): Promise<Shop[]> => {
      const { shops } = await apiPost<{ shops: Shop[] }>({ path: '/shop-get-mine', body: {} });
      return shops;
    },
  });
}

export function useUpsertShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertShopInput) => {
      const r = await apiPost<{ shop: Shop }>({ path: '/shop-upsert', body: input });
      return r.shop;
    },
    onSuccess: (shop) => {
      qc.invalidateQueries({ queryKey: ['my-shops'] });
      qc.invalidateQueries({ queryKey: ['shop', shop.id] });
      qc.invalidateQueries({ queryKey: ['shops'] });
    },
  });
}

// Pre-prod: follow / unfollow a boutique. Mirrors the product-favorite-toggle
// pattern : one round-trip returns the new is-following state and the
// denormalized follower_count so the storefront's stat column and CTA flip
// together in optimistic UI without a re-fetch.
export function useToggleShopFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ shopId }: { shopId: string }) => {
      return apiPost<{ following: boolean; follower_count: number }>({
        path: '/shop-follow-toggle',
        body: { shop_id: shopId },
      });
    },
    onSuccess: (res, { shopId }) => {
      // Patch the cached shop in place so the storefront and any list card
      // already on screen reflect the new follower count immediately.
      qc.setQueryData<Shop | undefined>(['shop', shopId], (prev) =>
        prev ? { ...prev, isFollowing: res.following, followerCount: res.follower_count } : prev,
      );
      qc.invalidateQueries({ queryKey: ['shops'] });
    },
  });
}
