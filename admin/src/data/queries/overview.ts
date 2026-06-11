'use client';

// Final sprint §2 — real KPI counts (admin-overview fn → admin_overview RPC).
// Shared by the Overview page and the Sidebar badges (same query cache).

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface AdminOverview {
  users_count: number;
  listings_active: number;
  listings_pending: number;
  orders_total: number;
  orders_placed: number;
  orders_paid: number;
  orders_preparing: number;
  orders_delivered: number;
  orders_released: number;
  orders_disputed: number;
  orders_cancelled: number;
  orders_refunded: number;
  kyc_pending: number;
  withdrawals_pending: number;
  gmv_minor: number;
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => {
      const r = await apiFetch<{ overview: AdminOverview }>('admin-overview', {});
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.overview;
    },
    refetchInterval: 30_000,
  });
}
