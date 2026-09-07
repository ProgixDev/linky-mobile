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
  // Le numero QUI PAIE — voir src/lib/payerPhone.ts. Reclame UNIQUEMENT par les
  // rails qui encaissent sur un numero guineen (la diaspora paie avec un compte
  // OM/MTN guineen qui n'est pas forcement le numero du compte, client
  // 2026-09-05). Les cartes et Soutra Money identifient le locataire sur leur
  // propre page : leur reclamer un numero le bloquerait pour rien.
  // Doit rester d'accord avec LENGOPAY_RAILS[...].needsAccount cote serveur :
  // Kulu encaisse SUR un numero, comme Orange et MTN.
  // PayCard aussi : elle encaisse sur un numero ET sur un numero de compte.
  const needsAccountNumber = method === 'orange-money' || method === 'mtn-money'
    || method === 'kulu' || method === 'paycard';
  const payerPhone = usePayerPhone();
  const needsPayerPhone = needsAccountNumber && !payerPhone.loading;
  const payerPhoneValid = !needsAccountNumber || payerPhone.valid;
  const payerPhoneE164 = payerPhone.e164;
  // Numero de compte PayCard. Il ne quitte l'appareil que dans l'appel
  // d'initialisation : ni stocke, ni journalise.
  const [payerCard, setPayerCard] = useState('');
  const payerCardDigits = payerCard.replace(/\D/g, '');
  const payerCardValid = method !== 'paycard' || payerCardDigits.length >= 6;

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
      // Le moyen choisi part TEL QUEL. Il etait ecrase en 'orange-money' pour
      // tout ce qui n'etait pas la carte : un locataire qui choisissait MTN
      // recevait une demande Orange Money — de l'argent demande au mauvais
      // operateur, pas une erreur d'affichage. Corrige le 2026-09-07 ;
      // 'wallet' n'est pas propose ici (voir le commentaire de `method`), donc
      // aucune valeur que booking-sign-pay refuse ne peut arriver ici.
      const res = await signPay.mutateAsync({
        bookingId: booking.id,
        ...(needsAccountNumber && payerPhoneE164 ? { payerPhone: payerPhoneE164 } : {}),
        ...(method === 'paycard' && payerCardDigits ? { payerCard: payerCardDigits } : {}),
        paymentMethod: method as Exclude<PaymentMethod, 'wallet'>,
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

      // Soutra Money / carte Lengopay : le locataire finit sur la page du rail,
      // dans la WebView de l'appli. La fermer ramene ici, ou l'ecran sonde —
      // l'issue ne depend jamais de ce que la page affichait.
      if (res.next_step?.kind === 'webview') {
        // replace, PAS push : la WebView se referme elle-meme en `replace` vers
        // /bookings/{id}. Un push empilerait donc deux fois cet ecran, et un
        // retour apres paiement ramenerait le locataire sur la meme page au
        // lieu de sa liste. Meme geste que le panier et le boost.
        router.replace({
          pathname: '/checkout/pay',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`.
          params: { url: res.next_step.url, bookingId: booking.id },
        } as any);
        return;
      }

      // Kulu : le locataire recoit un code par SMS. Sans cet ecran il n'aurait
      // aucun endroit ou le saisir.
      if (res.next_step?.kind === 'otp') {
        router.replace({
          pathname: '/checkout/otp',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`.
          params: { payId: res.next_step.payId, bookingId: booking.id },
        } as any);
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

        {/* Numero de compte PayCard — au-dessus du telephone : c'est
            l'information propre a ce rail, le telephone n'en est que le canal
            du code. Sans ce champ, le bouton echouerait sur un
            CARD_NUMBER_REQUIRED que rien a l'ecran ne permettrait de corriger. */}
        {booking.status === 'accepted' && method === 'paycard' && (
          <Input
            label="Numéro de compte PayCard"
            leadingIcon="card"
            keyboardType="number-pad"
            placeholder="Le numéro inscrit sur ta carte"
            value={payerCard}
            onChangeText={setPayerCard}
            helperText="On l’envoie à PayCard pour lancer le paiement ; Linky ne le conserve pas."
          />
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
              // Neutre volontairement : ce champ sert aussi Kulu depuis le
              // 2026-09-07. Il disait « le numéro Orange Money / MTN qui
              // recevra la demande de confirmation » — deux opérateurs que le
              // locataire n'avait pas choisis, et un mécanisme qui n'est pas
              // celui de Kulu, où c'est un code qui arrive par SMS.
              payerPhone.digits.length === 0
                ? 'Indique le numéro du compte qui paie.'
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
            disabled={payBusy || !payerPhoneValid || !payerCardValid}
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
