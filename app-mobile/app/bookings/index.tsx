// Tenant's rental bookings list (location par jour / par mois).
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { ErrorStateView } from '../../src/components/feedback/EmptyState';
import { Skeleton } from '../../src/components/primitives/Skeleton';
import { BookingCard } from '../../src/components/booking/BookingUI';
import { useMyBookings } from '../../src/data/queries';
import { FilterChips, type FilterChip } from '../../src/components/nav/FilterChips';
import { useTranslation } from 'react-i18next';
import type { BookingStatus } from '../../src/data/types';

// DEMANDE DU CLIENT, 2026-09-09 : « On pourra rajouter un filtre ici comme pour
// la partie Commandes — Toute / En attente / Active / Annulee ».
//
// CINQ PASTILLES ET NON QUATRE. Une reservation connait NEUF statuts, et ses
// quatre libelles n'en couvraient que sept : une location terminee ne serait
// apparue nulle part, sauf sous « Toutes ». Un filtre qui rend une ligne
// introuvable est pire que pas de filtre — d'ou « Terminees ».
//
// CHAQUE STATUT TOMBE DANS EXACTEMENT UNE CASE, y compris 'disputed' (range
// avec les actives : un litige porte sur un sejour en cours) et 'refunded'
// (range avec les annulees : l'argent est revenu, la location n'a pas eu lieu).
const BUCKETS: Record<Exclude<BookingFilter, 'all'>, BookingStatus[]> = {
  pending: ['requested', 'accepted'],
  active: ['paid', 'active', 'disputed'],
  completed: ['completed'],
  cancelled: ['cancelled', 'rejected', 'refunded'],
};

type BookingFilter = 'all' | 'pending' | 'active' | 'completed' | 'cancelled';

export default function BookingsRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const q = useMyBookings();
  const [filter, setFilter] = useState<BookingFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await q.refetch(); } finally { setRefreshing(false); }
  }, [q]);

  const bookings = q.data ?? [];
  const FILTERS: FilterChip<BookingFilter>[] = useMemo(
    () => [
      { id: 'all', label: t('bookings.filterAll') },
      { id: 'pending', label: t('bookings.filterPending') },
      { id: 'active', label: t('bookings.filterActive') },
      { id: 'completed', label: t('bookings.filterCompleted') },
      { id: 'cancelled', label: t('bookings.filterCancelled') },
    ],
    [t],
  );
  const filtered = filter === 'all'
    ? bookings
    : bookings.filter((b) => BUCKETS[filter].includes(b.status));

  if (q.isError && bookings.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Mes réservations" subtitle="Tes locations en cours." />
        <ErrorStateView onRetry={() => void q.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <ScreenHeader title="Mes réservations" subtitle="Tes locations en cours." />
        {/* Les pastilles n'apparaissent qu'une fois qu'il y a quelque chose a
            filtrer : au chargement, et sur un compte sans aucune reservation,
            elles ne feraient que promettre un tri de rien. */}
        {!q.isLoading && bookings.length > 0 && (
          <FilterChips chips={FILTERS} value={filter} onChange={setFilter} />
        )}
        {q.isLoading ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
            <Skeleton height={92} radius={18} />
            <Skeleton height={92} radius={18} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 60, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={24} color={colors.textMuted} strokeWidth={1.75} />
            </View>
            {/* DEUX VIDES DIFFERENTS. « Aucune reservation » s'adresse a
                quelqu'un qui n'en a jamais fait ; l'afficher parce qu'un filtre
                ne renvoie rien lui dirait que ses locations ont disparu. */}
            {bookings.length === 0 ? (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700' }}>Aucune réservation</Text>
                <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
                  Trouve un logement en location et réserve-le directement dans l'app.
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700' }}>Rien dans ce filtre</Text>
                <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
                  Tes autres réservations sont dans « {FILTERS[0].label} ».
                </Text>
              </>
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 6, gap: 10 }}>
            {filtered.map((b) => (
              <BookingCard key={b.id} booking={b} onPress={() => router.push(`/bookings/${b.id}` as never)} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
