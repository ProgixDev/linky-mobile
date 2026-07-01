// Boost — paid product visibility. List the seller's boosts + tiers, read one,
// and buy a boost (debits the wallet server-side). Follows the house TanStack
// pattern; the server owns the price, so create only sends { productId, days }.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Boost, BoostTier } from '../types';

export function useBoosts() {
  return useQuery({
    queryKey: ['boosts'],
    queryFn: async (): Promise<{ boosts: Boost[]; tiers: BoostTier[] }> =>
      apiPost<{ boosts: Boost[]; tiers: BoostTier[] }>({ path: '/list-boosts', body: {} }),
  });
}

export function useBoost(id: string | undefined) {
  return useQuery({
    queryKey: ['boost', id],
    enabled: !!id,
    queryFn: async (): Promise<Boost> => {
      const { boost } = await apiPost<{ boost: Boost }>({ path: '/get-boost', body: { id } });
      return boost;
    },
  });
}

export interface CreateBoostInput {
  productId: string;
  days: number;
}

export function useCreateBoost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, days }: CreateBoostInput): Promise<Boost> => {
      const { boost } = await apiPost<{ boost: Boost }>({
        path: '/create-boost',
        body: { product_id: productId, days },
      });
      return boost;
    },
    onSuccess: (_boost, { productId }) => {
      qc.invalidateQueries({ queryKey: ['boosts'] });
      qc.invalidateQueries({ queryKey: ['wallet'] }); // balance just dropped
      qc.invalidateQueries({ queryKey: ['products'] }); // product now surfaces boosted
      qc.invalidateQueries({ queryKey: ['product', productId] });
    },
  });
}
