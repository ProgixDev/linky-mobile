// Landlord booking detail — contract review + accept (signs, hold-to-confirm)
// or reject a request; then follows the lease through payment and move-in.
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { HoldToConfirmButton } from '../../../src/components/primitives/HoldToConfirmButton';
import { TopBar } from '../../../src/components/nav/TopBar';
import { MicroLabel } from '../../../src/components/lists/SectionHeader';
import { TrustStrip } from '../../../src/components/primitives/TrustStrip';
import { DetailStateScreen } from '../../../src/components/feedback/DetailState';
import { BookingStatusChip, ContractView, BookingTimeline, bookingPeriodText } from '../../../src/components/booking/BookingUI';
import { useLandlordBookings, useRespondBooking } from '../../../src/data/queries';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { formatGNF } from '../../../src/lib/format';

export default function LeaseDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { show } = useToast();
  const q = useLandlordBookings();
  const respond = useRespondBooking();

  const booking = (q.data ?? []).find((b) => b.id === id);

  if (q.isLoading || !booking) {
    return <DetailStateScreen loading={q.isLoading} title="Bail" onRetry={() => void q.refetch()} />;
  }

  const decide = (decision: 'accept' | 'reject') =>
    respond.mutate(
      { bookingId: booking.id, decision },
      {
        onSuccess: () =>
          show(decision === 'accept' ? 'Contrat signé — en attente du locataire ✅' : 'Demande refusée.', decision === 'accept' ? 'success' : 'info'),
        onError: (e) => show(toToastMessage(e, 'Action impossible.'), 'danger'),
      },
    );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Bail" back />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>{booking.property?.title}</Text>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
            {bookingPeriodText(booking)} · Locataire : {booking.counterpartyName ?? '—'}
          </Text>
          <BookingStatusChip status={booking.status} />
        </View>

        {booking.note.trim().length > 0 && (
          <View>
            <MicroLabel label="Message du locataire" />
            <Text style={{ fontSize: 13.5, color: colors.text, lineHeight: 20, letterSpacing: 0 }}>{booking.note}</Text>
          </View>
        )}

        {booking.status === 'requested' && (
          <TrustStrip tone="primary">
            <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
              <Text style={{ fontWeight: '700' }}>En acceptant, tu signes le contrat ci-dessous. </Text>
              Le locataire devra ensuite signer et payer {formatGNF(booking.totalGnf)} — l'argent reste en séquestre jusqu'à son emménagement, puis {formatGNF(booking.amountGnf)} te sont versés.
            </Text>
          </TrustStrip>
        )}

        <ContractView booking={booking} />

        <View>
          <MicroLabel label="Historique" />
          <BookingTimeline booking={booking} />
        </View>

        {booking.status === 'requested' && (
          <View style={{ gap: 10 }}>
            <HoldToConfirmButton
              label="Maintenir pour accepter & signer"
              onConfirm={() => decide('accept')}
              disabled={respond.isPending}
            />
            <Button
              variant="outline"
              label="Refuser la demande"
              disabled={respond.isPending}
              onPress={() => decide('reject')}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
