// Tenant booking detail — contract + timeline + the stage actions:
//   requested → Annuler
//   accepted  → Signer & payer (hold-to-confirm signature → Stripe sheet)
//   paid      → Confirmer l'emménagement (hold-to-confirm → escrow release)
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { Input } from '../../src/components/primitives/Input';
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
import { usePaymentProfile } from '../../src/lib/paymentProfile';
import { normalizeGnPhone, formatGnPhone, isValidGnPhone } from '../../src/lib/gnPhone';

export default function BookingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { show } = useToast();
  const q = useMyBookings();
  const signPay = useBookingSignPay();
  const cancel = useCancelBooking();
  const checkin = useConfirmCheckin();
  const [payBusy, setPayBusy] = useState(false);
  // Compte inscrit par email, sans numero enregistre (meme trou que corrige
  // cote commandes le 2026-08-25 — jamais reporte ici jusqu'ici).
  const { e164: onFilePhone, loading: payProfileLoading } = usePaymentProfile();
  const needsPayerPhone = !payProfileLoading && !onFilePhone;
  const [payerPhoneInput, setPayerPhoneInput] = useState('');
  const payerPhoneValid = !needsPayerPhone || isValidGnPhone(payerPhoneInput);
  const payerPhoneE164 = payerPhoneInput ? `+224${payerPhoneInput}` : undefined;

  const booking = (q.data ?? []).find((b) => b.id === id);

  if (q.isLoading || !booking) {
    return <DetailStateScreen loading={q.isLoading} title="Réservation" onRetry={() => void q.refetch()} />;
  }

  const onSignPay = async () => {
    if (payBusy) return;
    setPayBusy(true);
    try {
      // Ouvre la page Lengopay (Orange/MTN) dans la WebView interne. Aucune
      // signature n'est posee ici : client 2026-08-22, « la signature APRES le
      // paiement, pas avant ». C'est le cron qui, a la confirmation du rail,
      // bascule la reservation en 'paid' ET appose la signature du locataire.
      const { payment_url } = await signPay.mutateAsync({ bookingId: booking.id, payerPhone: payerPhoneE164 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`; /checkout/pay exists on disk (same cast as checkout/index + confirm).
      router.push({ pathname: '/checkout/pay', params: { url: payment_url, bookingId: booking.id } } as any);
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

        {/* Compte sans numero (inscrit par email) : sans ce champ, le
            paiement echouait sec avec « Numero de paiement requis » et rien
            a l'ecran ne permettait d'agir dessus. */}
        {booking.status === 'accepted' && needsPayerPhone && (
          <Input
            label="Numéro pour le paiement"
            leadingIcon="phone"
            keyboardType="phone-pad"
            placeholder="6XX XX XX XX"
            value={formatGnPhone(payerPhoneInput)}
            onChangeText={(txt) => setPayerPhoneInput(normalizeGnPhone(txt))}
            errorText={
              payerPhoneInput.length > 0 && !payerPhoneValid
                ? 'Numéro invalide (9 chiffres, commence par 6).'
                : undefined
            }
            helperText={
              payerPhoneInput.length === 0
                ? 'Aucun numéro sur ton compte — indique celui qui recevra le code de confirmation.'
                : undefined
            }
          />
        )}

        {/* Stage actions */}
        {booking.status === 'accepted' && (
          <HoldToConfirmButton
            // Amount lives in the trust strip above — keeping it out of the
            // label stops the text from crowding the 56px pill.
            label={payBusy ? 'Paiement en cours…' : 'Maintenir pour payer'}
            onConfirm={onSignPay}
            disabled={payBusy || !payerPhoneValid}
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
