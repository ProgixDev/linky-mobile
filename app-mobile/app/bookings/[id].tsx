// Tenant booking detail — contract + timeline + the stage actions:
//   requested → Annuler
//   accepted  → Signer & payer (hold-to-confirm signature → Stripe sheet)
//   paid      → Confirmer l'emménagement (hold-to-confirm → escrow release)
//             OU Annuler la réservation, jusqu'à 48 h avant (→ remboursement)
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
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
import { useMyBookings, useBookingSignPay, useCancelBooking, useConfirmCheckin, useWallet } from '../../src/data/queries';
import { PaymentMethodPicker, LENGOPAY_METHOD } from '../../src/components/payment/PaymentMethodPicker';
import { useToast } from '../../src/components/feedback/Toast';
import { ApiError, toToastMessage } from '../../src/lib/api';
import { formatGNF } from '../../src/lib/format';
import { contractIsSigned, contractPdfAvailable, shareContractPdf } from '../../src/lib/contractPdf';
import { formatGnPhone, gnOperatorMismatch } from '../../src/lib/gnPhone';
import { paidCancelWindow, formatCancelDeadline } from '../../src/lib/bookingCancelWindow';
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
  const wallet = useWallet();
  const [payBusy, setPayBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  // Client 2026-09-04 : la reservation n'offrait AUCUN choix de paiement, elle
  // sautait droit au champ telephone. Meme selecteur que le panier desormais.
  // LE PORTEFEUILLE EST PROPOSE DEPUIS LE 2026-09-24 (client : « dans
  // Réservation, au niveau du paiement le wallet n'apparaît pas, on peut le
  // rajouter »). Il ne l'etait pas parce que confirm_booking_payment credite le
  // sequestre A SENS UNIQUE — l'argent vient du rail — et l'emprunter pour un
  // paiement portefeuille aurait credite le sequestre sans debiter personne.
  // Ce rail-la a desormais son propre RPC, pay_booking_from_wallet
  // (20260924_01), qui fait un vrai virement en partie double.
  const [method, setMethod] = useState<PaymentMethod>(LENGOPAY_METHOD);
  // Le numero QUI PAIE — voir src/lib/payerPhone.ts. Reclame UNIQUEMENT par les
  // rails qui encaissent sur un numero guineen (la diaspora paie avec un compte
  // OM/MTN guineen qui n'est pas forcement le numero du compte, client
  // 2026-09-05). Les cartes et Soutra Money identifient le locataire sur leur
  // propre page : leur reclamer un numero le bloquerait pour rien.
  // Doit rester d'accord avec LENGOPAY_RAILS[...].needsAccount cote serveur :
  // Kulu encaisse SUR un numero, comme Orange et MTN.
  // PayCard aussi : elle encaisse sur un numero ET sur un numero de compte.
  // Le portefeuille ne passe par aucun rail externe : ni numero payeur, ni
  // numero de compte. Le reclamer bloquerait un paiement qui n'en a pas besoin.
  const needsAccountNumber = method === 'orange-money' || method === 'mtn-money'
    || method === 'kulu' || method === 'paycard';
  const payerPhone = usePayerPhone();
  const needsPayerPhone = needsAccountNumber && !payerPhone.loading;
  // LE NUMERO DOIT CORRESPONDRE AU RAIL CHOISI. Le 2026-09-09 a 22:14, un
  // numero MTN (66x) est parti sur le rail Orange Money : Lengopay a repondu
  // « Incorrect phone number », en anglais, et le paiement a echoue sans que
  // l'utilisateur puisse comprendre. On tranche donc AVANT de partir, avec un
  // message qui dit quoi faire. gnOperatorMismatch rend null des qu'elle n'est
  // pas certaine du prefixe : un numero inconnu passe et c'est le rail qui
  // tranche, plutot que de bloquer un client sur un prefixe recent.
  const operatorWarning = needsAccountNumber && payerPhone.valid
    ? gnOperatorMismatch(payerPhone.digits, method)
    : null;
  const payerPhoneValid = (!needsAccountNumber || payerPhone.valid) && !operatorWarning;
  const payerPhoneE164 = payerPhone.e164;
  // Numero de compte PayCard. Il ne quitte l'appareil que dans l'appel
  // d'initialisation : ni stocke, ni journalise.
  const [payerCard, setPayerCard] = useState('');
  const payerCardDigits = payerCard.replace(/\D/g, '');
  const payerCardValid = method !== 'paycard' || payerCardDigits.length >= 6;

  // ATTENTE DE CONFIRMATION — client 2026-09-09 : « l'utilisateur did his
  // payment and the page still in this ». Sur Orange/MTN la demande part chez
  // l'operateur et l'ecran restait le formulaire de paiement, avec un simple
  // toast qui disparait en trois secondes. Le locataire ne savait ni si sa
  // demande etait partie, ni quoi attendre.
  //
  // Cote articles ce moment a son ecran (checkout/confirm) ; il n'avait pas
  // d'equivalent ici. Plutot que de generaliser cet ecran-la — 407 lignes
  // nouees aux commandes, a leur intention de paiement et au panier — l'attente
  // est rendue ICI, sur l'ecran ou le locataire se trouve deja.
  const [awaitingPayment, setAwaitingPayment] = useState(false);

  const booking = (q.data ?? []).find((b) => b.id === id);
  const bookingStatus = booking?.status;

  // LE COMMENTAIRE D'ORIGINE DISAIT QUE CET ECRAN SONDAIT. Il ne sondait pas :
  // useMyBookings n'a aucun refetchInterval, et le seul refetch partait juste
  // apres l'envoi, quand la reservation est forcement encore 'accepted'.
  // L'ecran ne bougeait donc jamais tout seul. 5 s, la meme cadence que les
  // commandes sur un rail Lengopay ; l'intervalle s'arrete des que le statut
  // change, et n'existe pas hors de l'attente.
  const refetchRef = useRef(q.refetch);
  refetchRef.current = q.refetch;
  useEffect(() => {
    if (!awaitingPayment) return;
    if (bookingStatus && bookingStatus !== 'accepted') {
      setAwaitingPayment(false);
      return;
    }
    const timer = setInterval(() => { void refetchRef.current(); }, 5000);
    return () => clearInterval(timer);
  }, [awaitingPayment, bookingStatus]);

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

      // PORTEFEUILLE : le virement est deja fait. Pas d'attente, pas de
      // sondage — on le dit, et on recharge la reservation ET le solde.
      if (res.next_step?.kind === 'paid') {
        show('Paiement effectué depuis ton portefeuille ✅', 'success');
        void q.refetch();
        void wallet.refetch();
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
      // On ne se contente plus d'un toast : l'ecran passe en attente et se met
      // a jour tout seul jusqu'a ce que le cron bascule la reservation en 'paid'.
      setAwaitingPayment(true);
      void q.refetch();
    } catch (e) {
      show(toToastMessage(e, 'Le paiement a échoué.'), 'danger');
    } finally {
      setPayBusy(false);
    }
  };

  // ON NE LAISSE PAS PARTIR UN PAIEMENT QU'ON SAIT REFUSE. Le selecteur
  // n'affiche le portefeuille que s'il a un solde, mais ce solde peut etre
  // inferieur au total. Le serveur le refuserait proprement
  // (INSUFFICIENT_FUNDS) ; autant le dire avant le geste plutot qu'apres.
  const walletShort = method === 'wallet'
    && typeof wallet.data?.balanceGnf === 'number'
    && wallet.data.balanceGnf < booking.totalGnf;
  const isSale = booking.period === 'sale';
  const isExtension = !!booking.extendsBookingId;
  // STATUS_CHANGED veut dire « ton ecran est en retard » : on recharge au lieu
  // de laisser l'utilisateur devant une erreur qu'il ne peut pas comprendre.
  const onCancelError = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'STATUS_CHANGED') {
      void q.refetch();
      show('Ta réservation a changé d’état. On la recharge.', 'info');
      return;
    }
    show(toToastMessage(e, "Impossible d'annuler."), 'danger');
  };
  // L'heure n'est lue qu'au rendu : la limite ne bouge pas pendant qu'on lit
  // l'écran, et le serveur retranche de toute façon.
  const cancelWindow = paidCancelWindow(booking, Date.now());
  const cancelDeadlineText = formatCancelDeadline(booking.startDate);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={isSale ? 'Achat' : 'Réservation'} back />
      {/* CLAVIER : le champ « numero pour le paiement » se retrouvait CACHE
          DERRIERE le clavier (client 2026-09-09, capture a l'appui). Un
          ScrollView ordinaire ne fait rien de particulier quand un champ prend
          le focus : sous adjustResize la fenetre retrecit, mais rien ne
          remonte le champ dans la partie encore visible. On tape a l'aveugle.

          KeyboardAwareScrollView vient de react-native-keyboard-controller,
          deja installe et deja monte a la racine (KeyboardProvider) : c'est le
          meme moteur que les KeyboardAvoidingView de l'onboarding, mais qui
          fait defiler jusqu'au champ focalise au lieu de pousser tout l'ecran.

          `bottomOffset` = la marge gardee SOUS le champ une fois remonte. Le bouton de
          paiement vit dans le defilement : 24 px suffisent a le degager. */}
      <KeyboardAwareScrollView bottomOffset={24} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 16 }}>
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

        {/* TELECHARGER LE CONTRAT — client 2026-09-09. Il n'apparait qu'une fois
            le document COMPLET : les deux signatures posees. Avant le paiement
            la reservation n'est qu'un accord en cours, et laisser telecharger
            un contrat non signe donnerait au locataire une piece qui ne prouve
            rien — pire, qu'il pourrait croire opposable.

            Tout vient de l'appareil : `booking.contract` est l'instantane fige
            a la demande. Le PDF se genere donc sans reseau. */}
        {/* contractPdfAvailable() : sur un binaire anterieur au 2026-09-09 le
            code natif d'impression n'existe pas. On masque le bouton au lieu de
            proposer une action qui echouerait — et surtout, plus rien ici ne
            peut faire tomber l'ecran entier (voir l'incident decrit dans
            src/lib/contractPdf.ts). */}
        {contractIsSigned(booking) && contractPdfAvailable() && (
          <Button
            variant="outline"
            size="lg"
            block
            label={pdfBusy ? 'Préparation…' : 'Télécharger le contrat'}
            disabled={pdfBusy}
            onPress={async () => {
              setPdfBusy(true);
              try {
                const err = await shareContractPdf(booking);
                if (err) show(err, 'danger');
              } finally {
                setPdfBusy(false);
              }
            }}
          />
        )}

        <View>
          <MicroLabel label="Historique" />
          <BookingTimeline booking={booking} />
        </View>

        {/* Choix du moyen de paiement — meme composant que le panier et le
            boost (client 2026-09-04 : « unifier les methodes de paiement »).
            Il n'y en avait AUCUN ici : l'ecran sautait droit au champ
            telephone, ce qui bloquait net un payeur de la diaspora. */}
        {/* L'ATTENTE DE CONFIRMATION. Meme structure que l'ecran des articles :
            ce qui a ete demande, a qui, pour combien — puis ce qu'il reste a
            faire. Le formulaire de paiement s'efface pendant ce temps : le
            laisser inviterait a repayer une demande deja partie.

            PAS DE COMPTE A REBOURS, contrairement a l'ecran des commandes. Il y
            affiche l'echeance REELLE de l'intention de paiement ; la charge
            d'une reservation ne porte aucune information d'intention, donc tout
            chiffre affiche ici serait invente. Mieux vaut ne rien annoncer que
            d'annoncer faux sur un ecran d'argent.

            PAS DE « ANNULER LE PAIEMENT » NON PLUS : cancel-pending-payment
            n'accepte qu'un order_id. « Annuler la demande » juste en dessous
            reste disponible et annule la reservation, ce qui est une autre
            action — elle porte donc son propre nom. */}
        {booking.status === 'accepted' && awaitingPayment && (
          <View style={{ gap: 12 }}>
            <MicroLabel label="Paiement en cours" />
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 14,
                gap: 10,
              }}
            >
              <AwaitRow label="Méthode" value={method === 'mtn-money' ? 'MTN Mobile Money' : 'Orange Money'} />
              <AwaitRow label="Numéro" value={formatGnPhone(payerPhone.digits)} />
              <AwaitRow label="Montant" value={formatGNF(booking.totalGnf)} />
            </View>

            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(232,165,61,0.35)',
                backgroundColor: colors.accentSoft,
                padding: 14,
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700' }}>
                ⏳  Confirme sur ton téléphone
              </Text>
              <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', lineHeight: 17 }}>
                {`Une demande de ${formatGNF(booking.totalGnf)} vient de partir sur ton téléphone. Valide-la avec ton code — cet écran se met à jour tout seul.`}
              </Text>
            </View>
          </View>
        )}

        {booking.status === 'accepted' && !awaitingPayment && (
          <View>
            <MicroLabel label="Moyen de paiement" />
            <PaymentMethodPicker
              value={method}
              onChange={setMethod}
              walletBalanceGnf={wallet.data?.balanceGnf ?? null}
            />
          </View>
        )}

        {/* Numero de compte PayCard — au-dessus du telephone : c'est
            l'information propre a ce rail, le telephone n'en est que le canal
            du code. Sans ce champ, le bouton echouerait sur un
            CARD_NUMBER_REQUIRED que rien a l'ecran ne permettrait de corriger. */}
        {booking.status === 'accepted' && !awaitingPayment && method === 'paycard' && (
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
        {booking.status === 'accepted' && !awaitingPayment && needsPayerPhone && (
          <Input
            // PayCard pose DEUX champs de chiffres : sans libellé distinct,
            // le locataire retape son numéro de carte ici.
            label={method === 'paycard'
              ? "Numéro de téléphone (pour recevoir le code)"
              : "Numéro pour le paiement"}
            leadingIcon="phone"
            keyboardType="phone-pad"
            placeholder="6XX XX XX XX"
            value={formatGnPhone(payerPhone.digits)}
            onChangeText={payerPhone.onChange}
            errorText={
              payerPhone.digits.length > 0 && !payerPhone.valid
                ? 'Numéro invalide (9 chiffres, commence par 6).'
                : (operatorWarning ?? undefined)
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
        {booking.status === 'accepted' && !awaitingPayment && walletShort && (
          <Text variant="micro" tone="muted" style={{ textAlign: 'center', letterSpacing: 0, textTransform: 'none' }}>
            Ton portefeuille contient {formatGNF(wallet.data?.balanceGnf ?? 0)} — il manque{' '}
            {formatGNF(booking.totalGnf - (wallet.data?.balanceGnf ?? 0))}. Choisis un autre moyen de paiement.
          </Text>
        )}
        {booking.status === 'accepted' && !awaitingPayment && (
          <HoldToConfirmButton
            // Amount lives in the trust strip above — keeping it out of the
            // label stops the text from crowding the 56px pill.
            label={payBusy ? 'Paiement en cours…' : 'Maintenir pour payer'}
            onConfirm={onSignPay}
            disabled={payBusy || !payerPhoneValid || !payerCardValid || walletShort}
          />
        )}
        {booking.status === 'paid' && (
          <HoldToConfirmButton
            // ON N'EMMENAGE PAS DEUX FOIS. Une prolongation se confirme le jour
            // ou le nouveau terme commence, pas par une remise de cles : demander
            // a quelqu'un qui vit deja la de « confirmer son emmenagement »
            // l'aurait fait hesiter devant un bouton qui libere de l'argent.
            label={
              isExtension
                ? 'Maintenir pour confirmer la prolongation'
                : isSale
                  ? 'Maintenir pour confirmer la remise du bien'
                  : "Maintenir pour confirmer l'emménagement"
            }
            onConfirm={() =>
              checkin.mutate(booking.id, {
                onSuccess: () =>
                  show(
                    isSale
                      ? 'Remise confirmée — montant versé au vendeur ✅'
                      : isExtension
                        ? 'Prolongation confirmée — loyer versé au propriétaire ✅'
                        : 'Emménagement confirmé — loyer versé au propriétaire ✅',
                    'success',
                  ),
                onError: (e) => show(toToastMessage(e, 'Impossible de confirmer.'), 'danger'),
              })
            }
            disabled={checkin.isPending}
          />
        )}
        {/* Pas pendant qu'un paiement est en vol : le serveur refuse desormais
            (PAYMENT_IN_PROGRESS), autant ne pas proposer le geste. */}
        {(booking.status === 'requested' || booking.status === 'accepted') && !awaitingPayment && (
          <Button
            variant="outline"
            label="Annuler la demande"
            disabled={cancel.isPending}
            loading={cancel.isPending}
            onPress={() =>
              cancel.mutate({ bookingId: booking.id, expectedStatus: booking.status === 'requested' ? 'requested' : 'accepted' }, {
                onSuccess: () => {
                  show('Réservation annulée.', 'info');
                  router.back();
                },
                onError: (e) => onCancelError(e),
              })
            }
          />
        )}
        {/* ANNULATION APRES PAIEMENT — « une sécurité pour le client »
            (demande du 2026-09-23). Bouton discret : l'action attendue à ce
            stade reste de confirmer l'emménagement, juste au-dessus. Il passe
            par une alerte parce qu'il déplace de l'argent, alors que le bouton
            d'avant paiement ne fait qu'effacer une demande. */}
        {booking.status === 'paid' && cancelWindow === 'open' && (
          <Button
            variant="outline"
            label="Annuler la réservation"
            disabled={cancel.isPending}
            loading={cancel.isPending}
            onPress={() =>
              Alert.alert(
                'Annuler la réservation ?',
                `${formatGNF(booking.totalGnf)} te seront remboursés sur ton portefeuille Linky, frais compris. Cette réservation sera libérée et tu ne pourras pas revenir en arrière.`,
                [
                  { text: 'Garder ma réservation', style: 'cancel' },
                  {
                    text: 'Annuler et être remboursé',
                    style: 'destructive',
                    onPress: () =>
                      cancel.mutate({ bookingId: booking.id, expectedStatus: 'paid' }, {
                        onSuccess: () => {
                          show('Réservation annulée — montant remboursé sur ton portefeuille ✅', 'success');
                          router.back();
                        },
                        onError: (e) => onCancelError(e),
                      }),
                  },
                ],
              )
            }
          />
        )}
        {/* La date limite s'affiche AVEC le bouton : la « sécurité » demandée
            par le client n'en est une que si le locataire sait jusqu'à quand
            elle joue. */}
        {booking.status === 'paid' && cancelWindow === 'open' && cancelDeadlineText && (
          <Text variant="micro" tone="muted" style={{ textAlign: 'center', letterSpacing: 0, textTransform: 'none' }}>
            Remboursement intégral jusqu’au {cancelDeadlineText}.
          </Text>
        )}
        {/* Fenêtre passée : on l'explique, plutôt que de laisser un bouton qui
            se ferait refuser par le serveur. Le texte ne date pas la limite —
            une location à la journée se réserve souvent pour le lendemain, et
            « c'était possible jusqu'au 21 » se lirait comme un droit qu'on
            aurait laissé filer alors qu'il n'a jamais été ouvert. */}
        {booking.status === 'paid' && cancelWindow === 'closed' && (
          <Text variant="micro" tone="muted" style={{ textAlign: 'center', letterSpacing: 0, textTransform: 'none' }}>
            L’annulation en ligne s’arrête 48 h avant l’emménagement. Contacte {isSale ? 'le vendeur' : 'le propriétaire'} ou l’équipe Linky.
          </Text>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

/** Une ligne « libelle / valeur » du recapitulatif d'attente. */
function AwaitRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
