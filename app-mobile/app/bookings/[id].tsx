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
import { formatGnPhone } from '../../src/lib/gnPhone';
import { usePayerPhone } from '../../src/lib/payerPhone';
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
  // Client 2026-09-04 : la reservation n'offrait AUCUN choix de paiement, elle
  // sautait droit au champ telephone. Meme selecteur que le panier desormais.
  // Le portefeuille n'est PAS propose ici : confirm_booking_payment fait un
  // credit a sens unique vers le sequestre (l'argent vient du rail), donc s'en
  // servir pour un paiement portefeuille creerait de la monnaie. Ce rail-la
  // demande son propre RPC, pas un raccourci.
  const [method, setMethod] = useState<PaymentMethod>(LENGOPAY_METHOD);
  const isCard = method === 'card';
  // Le numero QUI PAIE — voir src/lib/payerPhone.ts. Toujours propose pour le
  // mobile money (la diaspora paie avec un compte OM/MTN guineen qui n'est pas
  // forcement le numero du compte, client 2026-09-05), jamais pour la carte.
  const payerPhone = usePayerPhone();
  const needsPayerPhone = !isCard && !payerPhone.loading;
  const payerPhoneValid = isCard || payerPhone.valid;
  const payerPhoneE164 = payerPhone.e164;

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
        // NE PAS annoncer « contrat signe » ici : a cet instant la reservation
        // est encore 'accepted'. C'est le webhook Stripe qui la bascule en
        // 'paid', une a deux secondes plus tard. Annoncer la signature avant
        // que le serveur l'ait posee, c'est exactement le mensonge d'ecran
        // corrige le 2026-08-25 sur le panier (« ta banque confirme » alors
        // qu'aucun paiement n'avait ete tente).
        show('Paiement envoyé — confirmation en cours…', 'info');
        void q.refetch();
        return;
      }

      // Orange/MTN via Lengopay v2 (2026-09-05) : plus de page hebergee — la
      // demande part chez l'operateur, le locataire confirme sur son telephone.
      // On reste sur l'ecran, qui sonde jusqu'a ce que le cron passe la
      // reservation en 'paid'. Meme prudence que le rail carte juste au-dessus :
      // ne rien annoncer comme paye tant que le serveur ne l'a pas acte.
      show('Demande envoyée — confirme sur ton téléphone.', 'info');
      void q.refetch();
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

        {/* Numero qui paie — pre-rempli avec celui du compte s'il est guineen,
            modifiable sinon (la diaspora regle avec un compte OM/MTN guineen
            pilote a distance). Inutile pour la carte. */}
        {booking.status === 'accepted' && needsPayerPhone && (
          <Input
            label="Numéro pour le paiement"
            leadingIcon="phone"
            keyboardType="phone-pad"
            placeholder="6XX XX XX XX"
            value={formatGnPhone(payerPhone.digits)}
            onChangeText={payerPhone.onChange}
            errorText={
              payerPhone.digits.length > 0 && !payerPhone.valid
                ? 'Numéro invalide (9 chiffres, commence par 6).'
                : undefined
            }
            helperText={
              payerPhone.digits.length === 0
                ? 'Indique le numéro Orange Money / MTN qui recevra la demande de confirmation.'
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
