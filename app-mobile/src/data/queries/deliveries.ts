// Seller-side delivery assignment. Two hooks:
//   useAvailableLivreurs — the picker source (list-available-livreurs). Returns
//     approved livreurs with no contact info; the seller picks by name/city/load.
//   useAssignDelivery — assigns (or reassigns) a livreur to one of the seller's
//     own orders via /delivery-assign. The RPC behind it is seller-gated, so a
//     non-owner caller gets FORBIDDEN regardless of what the body says.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { AvailableLivreur } from '../types';

// Pass the order's delivery city to surface same-zone livreurs first. enabled
// is false until the picker actually opens so we don't fetch the pool on every
// order detail view.
export function useAvailableLivreurs(city: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['available-livreurs', city ?? null],
    enabled,
    // Pool changes slowly relative to a picker session; a short stale window
    // keeps re-opens instant without showing a stale active-delivery count.
    staleTime: 30_000,
    queryFn: async (): Promise<AvailableLivreur[]> => {
      const { livreurs } = await apiPost<{ livreurs: AvailableLivreur[] }>({
        path: '/list-available-livreurs',
        body: { ...(city ? { city } : {}) },
      });
      return livreurs;
    },
  });
}

export interface AssignDeliveryInput {
  orderId: string;
  livreurId: string;
}

export function useAssignDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, livreurId }: AssignDeliveryInput) => {
      const { delivery } = await apiPost<{ delivery: unknown }>({
        path: '/delivery-assign',
        body: { order_id: orderId, livreur_id: livreurId },
      });
      return delivery;
    },
    onSuccess: (_data, { orderId }) => {
      // Refetch the order so order.delivery (status + assigned livreur name)
      // reflects the assignment, and the seller list so the row updates.
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['seller-orders'] });
      qc.invalidateQueries({ queryKey: ['available-livreurs'] });
    },
  });
}
