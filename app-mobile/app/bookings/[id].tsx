// Tenant booking detail — contract + timeline + the stage actions:
//   requested → Annuler
//   accepted  → Signer & payer (hold-to-confirm signature → Stripe sheet)
//   paid      → Confirmer l'emménagement (hold-to-confirm → escrow release)
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { HoldToConfirmButton } from '../../src/components/primitives/HoldToConfirmButton';
import { TopBar } from '../../src/components/nav/TopBar';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { TrustStrip } from '../../src/components/primitives/TrustStrip';
import { DetailStateScreen } from '../../src/components/feedback/DetailState';
import { BookingStatusChip, ContractView, BookingTimeline, bookingPeriodText } from '../../src/components/booking/BookingUI';
import { useMyBookings, useBookingSignPay, useCancelBooking, useConfirmCheckin } from '../../src/data/queries';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { formatGNF } from '../../src/lib/format';

export default function BookingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { show } = useToast();
  const q = useMyBookings();
  const signPay = useBookingSignPay();
  const cancel = useCancelBooking();
  const checkin = useConfirmCheckin();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [payBusy, setPayBusy] = useState(false);

  const booking = (q.data ?? []).find((b) => b.id === id);

  if (q.isLoading || !booking) {
    return <DetailStateScreen loading={q.isLoading} title="Réservation" onRetry={() => void q.refetch()} />;
  }

  const onSignPay = async () => {
    if (payBusy) return;
    setPayBusy(true);
    try {
      const { client_secret } = await signPay.mutateAsync(booking.id);
      const { error: initErr } = await initPaymentSheet({
        merchantDisplayName: 'Linky',
        paymentIntentClientSecret: client_secret,
        returnURL: 'linky://stripe-redirect',
      });
      if (initErr) { show('Impossible de préparer le paiement.', 'danger'); return; }
      const { error: payErr } = await presentPaymentSheet();
      if (payErr) {
        // Cancelled or failed — the booking simply stays 'accepted', retry any time.
        show('Paiement non finalisé — tu peux réessayer.', 'info');
        return;
      }
      show('Contrat signé — paiement confirmé 🎉', 'success');
      // The webhook flips the status server-side a moment later.
      setTimeout(() => void q.refetch(), 2500);
      void q.refetch();
    } catch (e) {
      show(toToastMessage(e, 'Le paiement a échoué.'), 'danger');
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Réservation" back />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>{booking.property?.title}</Text>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
            {bookingPeriodText(booking)} · Propriétaire : {booking.counterpartyName ?? '—'}
          </Text>
          <BookingStatusChip status={booking.status} />
        </View>

        {booking.status === 'accepted' && (
          <TrustStrip tone="primary">
            <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
              <Text style={{ fontWeight: '700' }}>Le propriétaire a signé. </Text>
              Relis le contrat ci-dessous, puis signe et paie {formatGNF(booking.totalGnf)} — l'argent reste en séquestre jusqu'à ton emménagement.
            </Text>
          </TrustStrip>
        )}
        {booking.status === 'paid' && (
          <TrustStrip tone="primary">
            <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
              <Text style={{ fontWeight: '700' }}>Contrat signé, argent en séquestre. </Text>
              Le jour de la remise des clés, confirme ton emménagement pour verser le loyer au propriétaire.
            </Text>
          </TrustStrip>
        )}

        <ContractView booking={booking} />

        <View>
          <MicroLabel label="Historique" />
          <BookingTimeline booking={booking} />
        </View>

        {/* Stage actions */}
        {booking.status === 'accepted' && (
          <HoldToConfirmButton
            // Amount lives in the trust strip above — keeping it out of the
            // label stops the text from crowding the 56px pill.
            label={payBusy ? 'Paiement en cours…' : 'Maintenir pour signer & payer'}
            onConfirm={onSignPay}
            disabled={payBusy}
          />
        )}
        {booking.status === 'paid' && (
          <HoldToConfirmButton
            label="Maintenir pour confirmer l'emménagement"
            onConfirm={() =>
              checkin.mutate(booking.id, {
                onSuccess: () => show('Emménagement confirmé — loyer versé au propriétaire ✅', 'success'),
                onError: (e) => show(toToastMessage(e, 'Impossible de confirmer.'), 'danger'),
              })
            }
            disabled={checkin.isPending}
          />
        )}
        {(booking.status === 'requested' || booking.status === 'accepted') && (
          <Button
            variant="outline"
            label="Annuler la demande"
            disabled={cancel.isPending}
            loading={cancel.isPending}
            onPress={() =>
              cancel.mutate(booking.id, {
                onSuccess: () => {
                  show('Réservation annulée.', 'info');
                  router.back();
                },
                onError: (e) => show(toToastMessage(e, "Impossible d'annuler."), 'danger'),
              })
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
