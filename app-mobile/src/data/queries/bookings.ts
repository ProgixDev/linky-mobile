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
      return apiPost<{ booking_id: string }>({
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

// Tenant signature + payment bootstrap: returns the Stripe client_secret for
// the PaymentSheet. The webhook flips the booking to 'paid' on success.
export function useBookingSignPay() {
  return useMutation({
    mutationFn: async (bookingId: string) => {
      return apiPost<{ booking_id: string; client_secret: string; publishable_key: string }>({
        path: '/booking-sign-pay',
        body: { booking_id: bookingId },
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
