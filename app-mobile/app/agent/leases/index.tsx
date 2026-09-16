// Landlord "Réservations" — real bookings list (was a ComingSoon placeholder).
// Intitule aligne sur la pastille du tableau de bord le 2026-09-09 : arriver
// sur « Suivi des baux » apres avoir touche « Réservations » donnait
// l'impression de s'etre trompe d'ecran.
//
// LE MEME FILTRE QUE COTE LOCATAIRE (client 2026-09-16 : « Tu peux mettre le
// meme filtre que cote locataire stp »). Les sections qui rangeaient les statuts
// a la facon de cet ecran sont remplacees par les pastilles partagees de
// src/lib/bookingFilters.ts. Elles avaient une consequence que la capture du
// client montrait : des reservations ANNULEES sous « Terminees ». Et un litige y
// etait classe termine alors que le locataire le voyait actif.
//
// La liste reste triee de la plus recente a la plus ancienne
// (list-landlord-bookings, created_at desc) : une nouvelle demande a traiter
// arrive donc en tete, sans section dediee.
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
import { BookingCard } from '../../../src/components/booking/BookingUI';
import { useLandlordBookings } from '../../../src/data/queries';
import { FilterChips } from '../../../src/components/nav/FilterChips';
import { filterBookings, useBookingFilterChips, type BookingFilter } from '../../../src/lib/bookingFilters';

export default function LeasesRoute() {
  const { colors } = useTheme();
  const q = useLandlordBookings();
  const [filter, setFilter] = useState<BookingFilter>('all');
  const FILTERS = useBookingFilterChips();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await q.refetch(); } finally { setRefreshing(false); }
  }, [q]);

  const bookings = q.data ?? [];
  const filtered = filterBookings(bookings, filter);

  if (q.isError && bookings.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Réservations" subtitle="Tes locations et ventes : demandes, contrats et loyers." />
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
        <ScreenHeader title="Réservations" subtitle="Tes locations et ventes : demandes, contrats et loyers." />
        {/* Comme cote locataire : les pastilles n'apparaissent qu'une fois qu'il
            y a quelque chose a filtrer. */}
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
            {/* DEUX VIDES DIFFERENTS. « Aucune reservation recue » s'adresse a un
                agent qui n'en a jamais eu ; l'afficher parce qu'un filtre ne
                renvoie rien lui ferait croire que ses reservations ont disparu. */}
            {bookings.length === 0 ? (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700' }}>Aucune réservation reçue</Text>
                <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
                  Les demandes de location de tes biens apparaîtront ici.
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
              <BookingCard key={b.id} booking={b} onPress={() => router.push(`/agent/leases/${b.id}` as never)} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
