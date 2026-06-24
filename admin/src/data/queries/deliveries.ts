'use client';

// Phase LIVREUR ASSIGNMENT — TanStack Query hooks for admin central dispatch.
//
// Endpoints (supabase/functions/{admin-list-deliveries,admin-list-livreurs,
// admin-assign-delivery}/index.ts):
//   - admin-list-deliveries : admin-only, status-filtered (default
//     'unassigned'), newest-first, with order ref/product/amount + buyer city.
//   - admin-list-livreurs   : admin-only, approved livreurs with city/vehicle
//     + active-delivery count for load balancing.
//   - admin-assign-delivery : admin-only assign/reassign → notifies the
//     livreur; the delivery appears in their list-livreur-deliveries.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export type DeliveryStatus = 'unassigned' | 'assigned' | 'in_transit' | 'delivered' | 'failed' | 'cancelled';

export interface DeliveryAddress {
  address_id?: string;
  label?: string;
  city?: string;
  district?: string;
  details?: string;
}

export interface AdminDelivery {
  id: string;
  orderId: string;
  status: DeliveryStatus;
  deliveryAddress: DeliveryAddress | null;
  assignedLivreur: { id: string; name: string | null } | null;
  order: {
    reference: string;
    productSnapshot: { title: string; photo: string; priceGnf: number } | null;
    amountGnf: number;
    buyerCity: string | null;
  } | null;
  createdAt: string;
}

export interface AdminLivreur {
  id: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  vehicleType: 'moto' | 'voiture' | 'velo' | 'a_pied' | null;
  activeDeliveries: number;
}

interface ListDeliveriesResponse {
  deliveries: AdminDelivery[];
  next_cursor: { created_at: string; id: string } | null;
}

export function useAdminDeliveries(status: DeliveryStatus, enabled = true) {
  return useQuery({
    queryKey: ['admin-deliveries', status],
    queryFn: async () => {
      const r = await apiFetch<ListDeliveriesResponse>('admin-list-deliveries', { status });
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.deliveries;
    },
    enabled,
    refetchInterval: 30_000,
  });
}

export function useAdminLivreurs(enabled = true) {
  return useQuery({
    queryKey: ['admin-livreurs'],
    queryFn: async () => {
      const r = await apiFetch<{ livreurs: AdminLivreur[] }>('admin-list-livreurs', {});
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.livreurs;
    },
    enabled,
    refetchInterval: 30_000,
  });
}

export function useAssignDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { delivery_id: string; livreur_id: string }) => {
      const r = await apiFetch<{ delivery: AdminDelivery }>('admin-assign-delivery', body);
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: "Erreur d'assignation" };
      }
      return r.data.delivery;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['admin-deliveries'] });
      qc.invalidateQueries({ queryKey: ['admin-livreurs'] });
      toast.success(
        d.assignedLivreur?.name
          ? `Livraison assignée à ${d.assignedLivreur.name}. Livreur notifié.`
          : 'Livraison assignée. Livreur notifié.',
      );
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message_fr?: string };
      switch (e.code) {
        case 'FORBIDDEN_ADMIN':
          toast.error('Accès admin requis');
          return;
        case 'DELIVERY_NOT_FOUND':
          toast.error('Livraison introuvable');
          return;
        case 'INVALID_DELIVERY_STATUS':
          toast.error('Cette livraison ne peut plus être assignée');
          return;
        case 'INVALID_ORDER_STATUS':
          toast.error("La commande n'est pas dans un état permettant l'assignation");
          return;
        case 'NOT_A_LIVREUR':
          toast.error("Cet utilisateur n'est pas livreur");
          return;
        default:
          toast.error(e.message_fr ?? "Erreur d'assignation");
      }
    },
  });
}
