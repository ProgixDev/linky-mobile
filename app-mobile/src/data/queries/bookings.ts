// Rental bookings — tenant journey (request → landlord signs → tenant signs &
// pays via Stripe sheet → check-in confirm) + landlord side. All authed.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Booking } from '../types';

export interface RequestBookingInput {
  propertyId: string;
  period: 'day' | 'month';
  startDate: string;      // YYYY-MM-DD
  endDate?: string;       // daily only (exclusive check-out)
  months?: number;        // monthly only
  note?: string;
}

export interface PropertyAvailability {
  blocked_by_monthly: boolean;
  ranges: { start: string; end: string }[];
}

/** Creneaux deja payes ET signes d'un bien, pour griser le calendrier.
 *  Lecture publique : que des dates, jamais l'identite du locataire. */
export function usePropertyAvailability(propertyId: string | undefined) {
  return useQuery({
    queryKey: ['property-availability', propertyId],
    enabled: !!propertyId,
    // Un sejour peut etre paye par quelqu'un d'autre pendant que l'ecran est
    // ouvert : on ne veut pas servir un calendrier perime depuis le cache.
    staleTime: 30_000,
    queryFn: async (): Promise<PropertyAvailability> =>
      apiPost<PropertyAvailability>({
        path: '/property-availability',
        authed: false,
        body: { property_id: propertyId },
      }),
  });
}

export function useMyBookings() {
  return useQuery({
    queryKey: ['my-bookings'],
    queryFn: async (): Promise<Booking[]> => {
      const { bookings } = await apiPost<{ bookings: Booking[] }>({
        path: '/list-my-bookings',
        body: {},
      });
      return bookings;
    },
  });
}

export function useLandlordBookings() {
  return useQuery({
    queryKey: ['landlord-bookings'],
    queryFn: async (): Promise<Booking[]> => {
      const { bookings } = await apiPost<{ bookings: Booking[] }>({
        path: '/list-landlord-bookings',
        body: {},
      });
      return bookings;
    },
  });
}

export function useRequestBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RequestBookingInput) => {
      return apiPost<{ booking_id: string; instant: boolean }>({
        path: '/booking-request',
        body: {
          property_id: input.propertyId,
          period: input.period,
          start_date: input.startDate,
          ...(input.endDate ? { end_date: input.endDate } : {}),
          ...(input.months ? { months: input.months } : {}),
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
    },
  });
}

export function useRespondBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; decision: 'accept' | 'reject' }) => {
      return apiPost<{ ok: true; status: string }>({
        path: '/booking-respond',
        body: { booking_id: input.bookingId, decision: input.decision },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landlord-bookings'] });
    },
  });
}

// Tenant signature + payment bootstrap: stamps the tenant signature and returns
// the Lengopay hosted-page URL (Orange/MTN — the same rail as product orders).
// The app opens that URL in the in-app WebView; the cron flips the booking to
// 'paid' once the rail confirms. (Was Stripe — dropped in Guinea.)
export function useBookingSignPay() {
  return useMutation({
    // payerPhone : compte inscrit par email, sans numero enregistre — meme
    // trou que celui corrige cote commandes le 2026-08-25 (15 comptes sur 20
    // n'ont aucun numero). Sans ce champ, le serveur rejette avec
    // PAYER_PHONE_REQUIRED et rien dans l'ecran ne permettait d'agir dessus.
    mutationFn: async (input: { bookingId: string; payerPhone?: string }) => {
      return apiPost<{ booking_id: string; payment_url: string }>({
        path: '/booking-sign-pay',
        body: {
          booking_id: input.bookingId,
          ...(input.payerPhone ? { payer_phone: input.payerPhone } : {}),
        },
      });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      return apiPost<{ ok: true }>({ path: '/booking-cancel', body: { booking_id: bookingId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
    },
  });
}

export function useConfirmCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      return apiPost<{ ok: true }>({ path: '/booking-checkin-confirm', body: { booking_id: bookingId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

// Owner marks an accepted visit as completed (the "visite obligatoire avant
// transaction" precondition for achat/vente).
export function useCompleteVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (visitRequestId: string) => {
      return apiPost<{ ok: true }>({ path: '/visit-complete', body: { visit_request_id: visitRequestId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-visits'] });
      qc.invalidateQueries({ queryKey: ['my-visit-requests'] });
    },
  });
}
