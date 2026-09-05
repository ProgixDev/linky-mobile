// Tenant booking detail — contract + timeline + the stage actions:
//   requested → Annuler
//   accepted  → Signer & payer (hold-to-confirm signature → Stripe sheet)
//   paid      → Confirmer l'emménagement (hold-to-confirm → escrow release)
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useStripe, PaymentSheetError } from '@stripe/stripe-react-native';
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
import { PaymentMethodPicker, LENGOPAY_METHOD } from '../../src/components/payment/PaymentMethodPicker';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { formatGNF } from '../../src/lib/format';
import { usePaymentProfile } from '../../src/lib/paymentProfile';
import { normalizeGnPhone, formatGnPhone, isValidGnPhone } from '../../src/lib/gnPhone';
import type { PaymentMethod } from '../../src/data/types';

export default function BookingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { show } = useToast();
  const q = useMyBookings();
  const signPay = useBookingSignPay();
  const cancel = useCancelBooking();
  const checkin = useConfirmCheckin();
  const [payBusy, setPayBusy] = useState(false);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  // Compte inscrit par email, sans numero enregistre (meme trou que corrige
  // cote commandes le 2026-08-25 — jamais reporte ici jusqu'ici).
  const { e164: onFilePhone, loading: payProfileLoading, profile: payProfile } = usePaymentProfile();
  // Client 2026-09-04 : la reservation n'offrait AUCUN choix de paiement, elle
  // sautait droit au champ telephone. Meme selecteur que le panier desormais.
  // Le portefeuille n'est PAS propose ici : confirm_booking_payment fait un
  // credit a sens unique vers le sequestre (l'argent vient du rail), donc s'en
  // servir pour un paiement portefeuille creerait de la monnaie. Ce rail-la
  // demande son propre RPC, pas un raccourci.
  const [method, setMethod] = useState<PaymentMethod>(LENGOPAY_METHOD);
  const isCard = method === 'card';
  const needsPayerPhone = !isCard && !payProfileLoading && !onFilePhone;
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
      // Aucune signature n'est posee ici : client 2026-08-22, « la signature
      // APRES le paiement, pas avant ». C'est confirm_booking_payment qui, a la
      // confirmation du rail, bascule la reservation en 'paid' ET appose la
      // signature du locataire — quel que soit le rail emprunte.
      const res = await signPay.mutateAsync({
        bookingId: booking.id,
        payerPhone: payerPhoneE164,
        paymentMethod: method === 'card' ? 'card' : 'orange-money',
      });

      // Carte : feuille Stripe native, exactement comme le panier.
      if (res.payment) {
        const { error: initErr } = await initPaymentSheet({
          merchantDisplayName: 'Linky',
          paymentIntentClientSecret: res.payment.client_secret,
          returnURL: 'linky://stripe-redirect',
        });
        if (initErr) {
          show('Impossible de préparer le paiement', 'danger');
          return;
        }
        const { error: payErr } = await presentPaymentSheet();
        if (payErr) {
          // Fermer la feuille ne doit rien declencher d'autre que sa propre
          // fermeture — meme correctif que le panier le 2026-08-25, ou un
          // abandon envoyait vers un faux ecran d'attente.
          if (payErr.code === PaymentSheetError.Canceled) {
            show('Paiement annulé.', 'info');
            return;
          }
          show(payErr.message || 'Paiement échoué', 'danger');
          return;
        }
        // Le webhook Stripe (metadata.kind='booking') bascule la reservation en
        // 'paid' en quelques secondes ; la liste se rafraichit toute seule.
        show('Paiement reçu — contrat signé ✅', 'success');
        void q.refetch();
        return;
      }

      // Lengopay : page hebergee (carte, wallet ou mobile money) dans la WebView.
      if (res.payment_url) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`; /checkout/pay exists on disk (same cast as checkout/index + confirm).
        router.push({ pathname: '/checkout/pay', params: { url: res.payment_url, bookingId: booking.id } } as any);
        return;
      }
      show('Réponse inattendue du serveur.', 'danger');
    } catch (e) {
      show(toToastMessage(e, 'Le paiement a échoué.'), 'danger');
    } finally {
      setPayBusy(false);
    }
  };

  const isSale = booking.period === 'sale';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={isSale ? 'Achat' : 'Réservation'} back />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>{booking.property?.title}</Text>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
            {bookingPeriodText(booking)} · {isSale ? 'Vendeur' : 'Propriétaire'} : {booking.counterpartyName ?? '—'}
          </Text>
          <BookingStatusChip status={booking.status} />
        </View>

        {booking.status === 'accepted' && (
          <TrustStrip tone="primary">
            <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
              <Text style={{ fontWeight: '700' }}>{isSale ? 'Le vendeur a signé. ' : 'Le propriétaire a signé. '}</Text>
              {isSale
                ? `Relis le contrat ci-dessous, puis signe et paie ${formatGNF(booking.totalGnf)} — l'argent reste en séquestre jusqu'à la remise du bien.`
                : `Relis le contrat ci-dessous, puis signe et paie ${formatGNF(booking.totalGnf)} — l'argent reste en séquestre jusqu'à ton emménagement.`}
            </Text>
          </TrustStrip>
        )}
        {booking.status === 'paid' && (
          <TrustStrip tone="primary">
            <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
              <Text style={{ fontWeight: '700' }}>Contrat signé, argent en séquestre. </Text>
              {isSale
                ? 'Le jour de la remise du bien, confirme la réception pour verser le montant au vendeur.'
                : 'Le jour de la remise des clés, confirme ton emménagement pour verser le loyer au propriétaire.'}
            </Text>
          </TrustStrip>
        )}

        <ContractView booking={booking} />

        <View>
          <MicroLabel label="Historique" />
          <BookingTimeline booking={booking} />
        </View>

        {/* Choix du moyen de paiement — meme composant que le panier et le
            boost (client 2026-09-04 : « unifier les methodes de paiement »).
            Il n'y en avait AUCUN ici : l'ecran sautait droit au champ
            telephone, ce qui bloquait net un payeur de la diaspora. */}
        {booking.status === 'accepted' && (
          <View>
            <MicroLabel label="Moyen de paiement" />
            <PaymentMethodPicker value={method} onChange={setMethod} />
          </View>
        )}

        {/* Compte sans numero (inscrit par email) : sans ce champ, le
            paiement echouait sec avec « Numero de paiement requis » et rien
            a l'ecran ne permettait d'agir dessus. Inutile pour la carte. */}
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
            label={isSale ? 'Maintenir pour confirmer la remise du bien' : "Maintenir pour confirmer l'emménagement"}
            onConfirm={() =>
              checkin.mutate(booking.id, {
                onSuccess: () =>
                  show(
                    isSale ? 'Remise confirmée — montant versé au vendeur ✅' : 'Emménagement confirmé — loyer versé au propriétaire ✅',
                    'success',
                  ),
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
