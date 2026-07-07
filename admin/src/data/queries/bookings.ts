'use client';

// Bookings console (2026-07-07) — TanStack Query hooks over the two admin
// booking endpoints:
//   - admin-list-bookings   : list w/ party names + property snapshot, status
//                             filter, newest first.
//   - admin-resolve-booking : refund (escrow → locataire, total), release
//                             (escrow → propriétaire + frais plateforme),
//                             dispute (freeze paid → disputed, no money).
// Money exits are only possible from paid/disputed — an 'active' booking has
// already paid its landlord.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export type BookingStatus =
  | 'requested' | 'accepted' | 'rejected' | 'cancelled'
  | 'paid' | 'active' | 'disputed' | 'refunded' | 'completed';

export interface AdminBookingRow {
  id: string;
  status: BookingStatus;
  period: 'day' | 'month';
  start_date: string;
  end_date: string | null;
  months: number | null;
  rent_minor: number;
  amount_minor: number;
  fees_minor: number;
  total_minor: number;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  landlord_id: string;
  property_id: string;
  tenant_name: string | null;
  landlord_name: string | null;
  property_title: string | null;
  property_city: string | null;
  property_district: string | null;
}

interface ListBookingsResponse {
  bookings: AdminBookingRow[];
}

interface ResolveBookingBody {
  booking_id: string;
  action: 'refund' | 'release' | 'dispute';
  reason?: string;
}

interface ResolveBookingResponse {
  ok: true;
  status: BookingStatus;
}

// Same 30s poll posture as the disputes/KYC/withdrawals queues.
export function useAdminBookings(status?: BookingStatus) {
  return useQuery({
    queryKey: ['admin-bookings', status ?? 'all'],
    queryFn: async () => {
      const r = await apiFetch<ListBookingsResponse>(
        'admin-list-bookings',
        status ? { status } : {},
      );
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.bookings;
    },
    refetchInterval: 30_000,
  });
}

export function useResolveBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ResolveBookingBody) => {
      const r = await apiFetch<ResolveBookingResponse>('admin-resolve-booking', body);
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur décision' };
      }
      return r.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-bookings'] });
      toast.success(
        data.status === 'refunded'
          ? 'Réservation remboursée au locataire. Les deux parties sont notifiées.'
          : data.status === 'active'
            ? 'Loyer versé au propriétaire. Propriétaire notifié.'
            : 'Réservation placée en litige.',
      );
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message_fr?: string };
      switch (e.code) {
        case 'FORBIDDEN_ADMIN':
          toast.error('Accès admin requis');
          return;
        case 'BOOKING_NOT_FOUND':
          toast.error('Réservation introuvable');
          return;
        case 'INVALID_STATUS':
          toast.error('Réservation déjà résolue (ou pas encore payée)');
          return;
        default:
          toast.error(e.message_fr ?? 'Erreur décision');
      }
    },
  });
}
