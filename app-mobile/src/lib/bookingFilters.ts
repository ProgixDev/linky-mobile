import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilterChip } from '../components/nav/FilterChips';
import type { Booking, BookingStatus } from '../data/types';

/**
 * Le filtre des reservations — le MEME des deux cotes de la location.
 *
 * Cote locataire d'abord (client 2026-09-09 : « un filtre comme pour la partie
 * Commandes »), puis cote agent (client 2026-09-16 : « Tu peux mettre le meme
 * filtre que cote locataire »).
 *
 * UNE SEULE DEFINITION, ET CE N'EST PAS UNE COQUETTERIE. Avant, l'ecran de
 * l'agent rangeait les statuts a sa facon, en sections : une reservation ANNULEE
 * y apparaissait sous « Terminees », un LITIGE aussi, et une location payee
 * sous « Signees ». Le locataire, lui, voyait le litige dans « Actives ». Pour
 * un meme sejour, les deux parties ne lisaient donc pas le meme etat. Recopier
 * les pastilles aurait gele cette divergence ; les partager la supprime.
 *
 * CINQ CASES POUR NEUF STATUTS, et chaque statut tombe dans EXACTEMENT une :
 * - 'disputed' avec les actives : un litige porte sur un sejour en cours ;
 * - 'refunded' avec les annulees : l'argent est revenu, la location n'a pas eu
 *   lieu ;
 * - « Terminees » ne contient QUE 'completed'. Un filtre qui rendrait une
 *   location annulee sous « Terminees » dirait qu'elle a eu lieu.
 */
export type BookingFilter = 'all' | 'pending' | 'active' | 'completed' | 'cancelled';

export const BOOKING_BUCKETS: Record<Exclude<BookingFilter, 'all'>, BookingStatus[]> = {
  pending: ['requested', 'accepted'],
  active: ['paid', 'active', 'disputed'],
  completed: ['completed'],
  cancelled: ['cancelled', 'rejected', 'refunded'],
};

export function filterBookings(bookings: Booking[], filter: BookingFilter): Booking[] {
  return filter === 'all' ? bookings : bookings.filter((b) => BOOKING_BUCKETS[filter].includes(b.status));
}

/** Les pastilles, dans l'ordre et avec les libelles communs aux deux ecrans. */
export function useBookingFilterChips(): FilterChip<BookingFilter>[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      { id: 'all', label: t('bookings.filterAll') },
      { id: 'pending', label: t('bookings.filterPending') },
      { id: 'active', label: t('bookings.filterActive') },
      { id: 'completed', label: t('bookings.filterCompleted') },
      { id: 'cancelled', label: t('bookings.filterCancelled') },
    ],
    [t],
  );
}
