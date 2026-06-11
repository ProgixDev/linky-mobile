'use client';

// Final sprint §2 — listings moderation hooks (list-listings-admin /
// moderate-listing). Takedown flips status to 'removed' (admin-only value,
// seller update fns refuse edits on it) + pushes the owner with the reason ;
// approve re-lists from pending / paused / removed.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export interface ListingOwner {
  id: string;
  display_name: string | null;
  kyc_status: string;
}

export interface AdminListing {
  id: string;
  kind: 'product' | 'property';
  title: string;
  category: string;
  price_minor: number;
  city: string;
  status: 'active' | 'reserved' | 'sold' | 'paused' | 'pending' | 'removed';
  view_count: number;
  created_at: string;
  shop_name: string | null;
  owner: ListingOwner | null;
}

interface ListListingsResponse {
  listings: AdminListing[];
}

interface ModerateBody {
  kind: 'product' | 'property';
  id: string;
  action: 'approve' | 'takedown';
  reason?: string;
}

export function useAdminListings(status?: AdminListing['status']) {
  return useQuery({
    queryKey: ['admin-listings', status ?? 'all'],
    queryFn: async () => {
      const r = await apiFetch<ListListingsResponse>('list-listings-admin', status ? { status } : {});
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.listings;
    },
    refetchInterval: 30_000,
  });
}

export function useModerateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ModerateBody) => {
      const r = await apiFetch<{ ok: true; status: string }>('moderate-listing', body);
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur modération' };
      }
      return r.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-listings'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast.success(
        data.status === 'removed'
          ? 'Annonce retirée. Vendeur notifié.'
          : 'Annonce remise en ligne.',
      );
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message_fr?: string };
      toast.error(e.message_fr ?? 'Erreur modération');
    },
  });
}
