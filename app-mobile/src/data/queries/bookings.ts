// Rental bookings — tenant journey (request → landlord signs → tenant signs &
// pays via Stripe sheet → check-in confirm) + landlord side. All authed.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Booking, PaymentMethod, PaymentNextStep } from '../types';

export interface RequestBookingInput {
  propertyId: string;
  period: 'day' | 'month' | 'sale';
  startDate: string;      // YYYY-MM-DD — for 'sale', a formality (today)
  endDate?: string;       // daily only (exclusive check-out)
  months?: number;        // monthly only
  note?: string;
  /** Prolongation d'un bail au mois en cours. Le serveur derive lui-meme la
   *  date de debut (la fin du bail parent) : startDate n'est alors qu'un
   *  affichage. */
  extendBookingId?: string;
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
          ...(input.extendBookingId ? { extend_booking_id: input.extendBookingId } : {}),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
      // Une prolongation change ce que le calendrier du bien doit montrer.
      qc.invalidateQueries({ queryKey: ['property-availability'] });
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
    //
    // paymentMethod (2026-09-04) : 'card' renvoie un client_secret Stripe
    // (profils etranger). Orange/MTN ne renvoient plus rien a ouvrir depuis
    // Lengopay v2 (2026-09-05) : le paiement part in-app, l'ecran sonde la
    // reservation jusqu'a ce que le cron la bascule en 'paid'.
    mutationFn: async (input: {
      bookingId: string;
      payerPhone?: string;
      /** PayCard : numero de compte de la carte prepayee. */
      payerCard?: string;
      /** Tout sauf 'wallet' : confirm_booking_payment crédite le séquestre à
       *  sens unique (l'argent vient du rail), donc payer une réservation au
       *  portefeuille créerait de la monnaie. Les rails Lengopay guinéens sont
       *  ouverts depuis le 2026-09-07 — « Unifier les méthodes de paiement ». */
      paymentMethod?: Exclude<PaymentMethod, 'wallet'>;
    }) => {
      return apiPost<{
        booking_id: string;
        payment?: { client_secret: string; publishable_key: string };
        next_step?: PaymentNextStep;
      }>({
        path: '/booking-sign-pay',
        body: {
          booking_id: input.bookingId,
          ...(input.payerPhone ? { payer_phone: input.payerPhone } : {}),
          ...(input.payerCard ? { payer_card: input.payerCard } : {}),
          ...(input.paymentMethod ? { payment_method: input.paymentMethod } : {}),
        },
      });
    },
  });
}

/** Annulation par le locataire. `refunded` distingue les deux cas que couvre
 *  /booking-cancel : avant paiement rien n'a bouge, apres paiement le sequestre
 *  revient au portefeuille (client 2026-09-23, fenetre de 48 h). Le portefeuille
 *  et le bien sont donc invalides eux aussi : un remboursement les change. */
export interface CancelBookingInput {
  bookingId: string;
  /** L'etat que l'ECRAN affichait au moment du geste. Le serveur refuse de
   *  rembourser si la ligne a change entre-temps : le cache tient 5 minutes et
   *  ne se rafraichit pas au retour au premier plan, et un remboursement ne doit
   *  pas partir sous un bouton qui disait « Annuler la demande ». */
  expectedStatus: 'requested' | 'accepted' | 'paid';
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, expectedStatus }: CancelBookingInput) => {
      return apiPost<{ ok: true; refunded: boolean }>({
        path: '/booking-cancel',
        body: { booking_id: bookingId, expected_status: expectedStatus },
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
      if (res.refunded) {
        qc.invalidateQueries({ queryKey: ['wallet'] });
        qc.invalidateQueries({ queryKey: ['properties'] });
        qc.invalidateQueries({ queryKey: ['property-availability'] });
      }
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

