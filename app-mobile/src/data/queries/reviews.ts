// Reviews & ratings — list a shop's reviews + submit one after a completed order.
// Follows the house TanStack pattern; the backend derives shop/seller from the order,
// so submit only sends order_id + rating + comment.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Review, Shop } from '../types';

export function useShopReviews(shopId: string | undefined) {
  return useQuery({
    queryKey: ['shop-reviews', shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<Review[]> => {
      const { reviews } = await apiPost<{ reviews: Review[] }>({
        path: '/list-shop-reviews',
        body: { shop_id: shopId },
      });
      return reviews;
    },
  });
}

export interface SubmitReviewInput {
  orderId: string;
  /** Carried only for cache invalidation — the server derives it from the order. */
  shopId: string;
  rating: number;
  comment?: string;
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, rating, comment }: SubmitReviewInput) =>
      apiPost<{ ok: boolean; rating: number; reviewCount: number }>({
        path: '/create-review',
        body: { order_id: orderId, rating, ...(comment ? { comment } : {}) },
      }),
    onSuccess: (res, { orderId, shopId }) => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['shop-reviews', shopId] });
      // Patch the shop's denormalized rating/count in cache so the header updates at once.
      qc.setQueryData<Shop | undefined>(['shop', shopId], (prev) =>
        prev ? { ...prev, rating: res.rating, reviewCount: res.reviewCount } : prev,
      );
      qc.invalidateQueries({ queryKey: ['shops'] });
    },
  });
}
