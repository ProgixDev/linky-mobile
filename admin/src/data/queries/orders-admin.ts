'use client';

// Final sprint §2 — admin orders table hooks (READ-ONLY ; the disputes Kanban
// keeps its own dedicated endpoints).

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type AdminOrderStatus =
  | 'placed' | 'paid' | 'preparing' | 'delivered'
  | 'released' | 'disputed' | 'cancelled' | 'refunded';

export interface AdminOrder {
  id: string;
  reference: string;
  total_minor: number;
  status: AdminOrderStatus;
  created_at: string;
  product_snapshot: { title?: string } | null;
  buyer: { id: string; display_name: string | null } | null;
  seller: { id: string; display_name: string | null } | null;
}

export function useAdminOrders(status?: AdminOrderStatus) {
  return useQuery({
    queryKey: ['admin-orders', status ?? 'all'],
    queryFn: async () => {
      const r = await apiFetch<{ orders: AdminOrder[] }>('list-orders-admin', status ? { status } : {});
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.orders;
    },
    refetchInterval: 30_000,
  });
}
