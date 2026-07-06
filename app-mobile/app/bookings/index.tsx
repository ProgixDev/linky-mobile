// Tenant's rental bookings list (location par jour / par mois).
import { useCallback, useState } from 'react';
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

export default function BookingsRoute() {
  const { colors } = useTheme();
  const q = useMyBookings();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await q.refetch(); } finally { setRefreshing(false); }
  }, [q]);

  const bookings = q.data ?? [];

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
        {q.isLoading ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
            <Skeleton height={92} radius={18} />
            <Skeleton height={92} radius={18} />
          </View>
        ) : bookings.length === 0 ? (
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 60, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={24} color={colors.textMuted} strokeWidth={1.75} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700' }}>Aucune réservation</Text>
            <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
              Trouve un logement en location et réserve-le directement dans l'app.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 6, gap: 10 }}>
            {bookings.map((b) => (
              <BookingCard key={b.id} booking={b} onPress={() => router.push(`/bookings/${b.id}` as never)} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
