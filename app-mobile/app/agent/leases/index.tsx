// Landlord "Suivi des baux" — real bookings list (was a ComingSoon placeholder).
// Requests to approve, signed/paid leases, active leases.
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
import type { Booking } from '../../../src/data/types';

const GROUPS: { key: string; label: string; statuses: Booking['status'][] }[] = [
  { key: 'todo',    label: 'À TRAITER',   statuses: ['requested'] },
  { key: 'signed',  label: 'SIGNÉES',     statuses: ['accepted', 'paid'] },
  { key: 'active',  label: 'BAUX ACTIFS', statuses: ['active'] },
  { key: 'closed',  label: 'TERMINÉES',   statuses: ['rejected', 'cancelled', 'completed', 'refunded', 'disputed'] },
];

export default function LeasesRoute() {
  const { colors } = useTheme();
  const q = useLandlordBookings();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await q.refetch(); } finally { setRefreshing(false); }
  }, [q]);

  const bookings = q.data ?? [];

  if (q.isError && bookings.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Suivi des baux" subtitle="Tes locations : demandes, contrats et loyers." />
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
        <ScreenHeader title="Suivi des baux" subtitle="Tes locations : demandes, contrats et loyers." />
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
            <Text style={{ fontSize: 15, fontWeight: '700' }}>Aucune réservation reçue</Text>
            <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
              Les demandes de location de tes biens apparaîtront ici.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
            {GROUPS.map((g) => {
              const rows = bookings.filter((b) => g.statuses.includes(b.status));
              if (rows.length === 0) return null;
              return (
                <View key={g.key} style={{ marginBottom: 18 }}>
                  <Text variant="micro" tone="muted" style={{ marginTop: 4, marginBottom: 8 }}>
                    {g.label} · {rows.length}
                  </Text>
                  <View style={{ gap: 10 }}>
                    {rows.map((b) => (
                      <BookingCard key={b.id} booking={b} onPress={() => router.push(`/agent/leases/${b.id}` as never)} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
