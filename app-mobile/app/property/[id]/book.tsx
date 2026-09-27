// Tenant booking wizard — location par jour (date range) or par mois (move-in
// date + duration). Shows the live price recap (rent + commission Linky,
// voir src/lib/fees.ts pour le taux),
// then sends the request to the landlord (booking-request). La visite en
// ligne a ete retiree le 2026-09-09 : le rendez-vous se prend par le chat.
import { useBuyerGate } from '../../../src/components/feedback/BuyerGate';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { TopBar } from '../../../src/components/nav/TopBar';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { MicroLabel } from '../../../src/components/lists/SectionHeader';
import { TrustStrip } from '../../../src/components/primitives/TrustStrip';
import { BookingCalendar } from '../../../src/components/booking/BookingCalendar';
import { formatBookingDate } from '../../../src/components/booking/BookingUI';
import { DetailStateScreen } from '../../../src/components/feedback/DetailState';
import {
  quoteRental,
  resolveDeposit,
  minStayShortfall,
} from '../../../src/lib/rentalPricing';
import { useMyBookings, useProperty, useRequestBooking } from '../../../src/data/queries';
import { addMonthsClamped } from '../../../src/lib/dates';
import { usePropertyAvailability } from '../../../src/data/queries/bookings';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { platformFeeGnf, priceWithFeeGnf } from '../../../src/lib/fees';
import { formatGNF } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';

function nightsBetween(start: string, end: string): number {
  return Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000);
}

export default function BookPropertyRoute() {
  // `extend` = l'identifiant du bail au mois que l'on prolonge (client
  // 2026-09-18 : « un bouton "Prolonger" qui renvoie vers le calendrier de
  // reservation »). Dans ce mode, la date de depart n'est PAS choisie : elle
  // est la fin du bail en cours. L'ecran l'affiche verrouillee, et le serveur
  // la recalcule de son cote — il ignore celle qu'on lui envoie.
  const { id, extend } = useLocalSearchParams<{ id: string; extend?: string }>();
  const { colors, radii } = useTheme();
  const { data: prop, isLoading, isError, refetch } = useProperty(id);
  const request = useRequestBooking();
  const availability = usePropertyAvailability(id);
  const { show } = useToast();
  const { requireBuyer } = useBuyerGate();

  const myBookings = useMyBookings();
  const parentLease = extend
    ? (myBookings.data ?? []).find((b) => b.id === extend) ?? null
    : null;
  const isExtension = !!extend;
  // Meme rabotage que Postgres et que le serveur (_shared/dates.ts) : un bail
  // signe un 31 janvier se termine un 28 fevrier, pas un 3 mars.
  const extendStart = parentLease?.months
    ? addMonthsClamped(parentLease.startDate, parentLease.months)
    : null;

  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [months, setMonths] = useState(12);
  const [note, setNote] = useState('');

  // La date de depart d'une prolongation ne se choisit pas.
  useEffect(() => {
    if (extendStart && startDate !== extendStart) setStartDate(extendStart);
  }, [extendStart, startDate]);

  const period: 'day' | 'month' = prop?.perMonth ? 'month' : 'day';
  const rent = prop?.priceGnf ?? 0;

  // ── LE MEME MOTEUR QUE LE SERVEUR, AU FRANC ─────────────────────────────
  // Cet ecran ne « pre-affiche » pas une estimation : le locataire SIGNE le
  // montant qu'il lit ici. Le calcul doit donc etre identique a celui de
  // booking-request, pas equivalent. D'ou rentalPricing.ts, jumeau octet pour
  // octet de _shared/rental-pricing.ts — et scripts/check-twins.mjs qui refuse
  // qu'ils divergent.
  //
  // Une PROLONGATION n'interroge ni la grille ni le sejour minimum : elle
  // reconduit le bail parent « aux memes conditions », et le serveur reprend
  // son loyer tel quel.
  const {
    nights,
    quote,
    deposit,
    fees,
    total,
    shortfall,
    ready,
  } = useMemo(() => {
    const empty = {
      nights: 0,
      quote: { rentMinor: 0, fullMinor: 0, discountMinor: 0, parts: [] as { units: number; priceMinor: number; count: number }[] },
      deposit: 0,
      fees: 0,
      total: 0,
      shortfall: null as number | null,
      ready: false,
    };
    if (period === 'day' ? !startDate || !endDate : !startDate) return empty;

    const n = period === 'day' ? nightsBetween(startDate!, endDate!) : 0;
    const units = period === 'day' ? n : months;
    const rates = isExtension ? [] : (prop?.rates ?? []);
    const q = isExtension
      ? { rentMinor: period === 'day' ? n * rent : rent, fullMinor: 0, discountMinor: 0, parts: [] }
      : quoteRental(period, rent, rates, units);

    // La caution suit le loyer REMISE : deux mois sur un bail obtenu a
    // 8 000 000 valent 16 000 000, pas 27 000 000.
    const dep = isExtension
      ? 0
      : resolveDeposit(
          prop?.depositBasis,
          prop?.depositValue,
          period === 'month' ? q.rentMinor : 0,
          q.rentMinor,
        );

    // LA COMMISSION NE PORTE PAS SUR LA CAUTION — elle ne fait que transiter.
    const f = platformFeeGnf(q.rentMinor);
    const miss = isExtension
      ? null
      : minStayShortfall(period, prop?.minNights, prop?.minMonths, units);

    return {
      nights: n,
      quote: q,
      deposit: dep,
      fees: f,
      total: q.rentMinor + dep + f,
      shortfall: miss,
      ready: miss === null && (period === 'day' ? n >= 1 && n <= 90 : true),
    };
  }, [period, startDate, endDate, rent, isExtension, months, prop]);

  // Le loyer commission comprise. Les deux lignes du recapitulatif
  // s'additionnent desormais EXACTEMENT sur le total, par construction : la
  // commission ne porte plus que sur le loyer, la caution est un nombre entier
  // a part. L'ancien bricolage — « la caution recoit le reste » — n'a plus lieu
  // d'etre.
  const rentWithFee = quote.rentMinor + fees;

  if (isLoading || isError || !prop) {
    return <DetailStateScreen loading={isLoading} title="Réserver" onRetry={() => void refetch()} />;
  }
  if (prop.type !== 'location') {
    // Achat/vente : pas de réservation par date — c'est un paiement unique.
    return <DetailStateScreen loading={false} title="Réserver" onRetry={() => router.back()} />;
  }

  const submit = () => {
    if (!ready || request.isPending || !startDate) return;
    // Filet pour l'arrivee DIRECTE sur cet ecran : la fiche du bien verrouille
    // deja le bouton « Reserver », mais un lien profond ou un retour arriere
    // amenent ici sans repasser par elle.
    if (!requireBuyer()) return;
    haptic.medium();
    request.mutate(
      {
        propertyId: prop.id,
        period,
        startDate,
        ...(period === 'day' ? { endDate: endDate! } : { months }),
        ...(extend ? { extendBookingId: extend } : {}),
        note,
      },
      {
        onSuccess: ({ booking_id, instant }) => {
          if (instant) {
            // Daily = instant-book: go straight to the booking to pay + sign.
            show('Réservation confirmée — règle le paiement pour la valider ✅', 'success');
            router.replace(`/bookings/${booking_id}` as never);
          } else {
            show('Demande envoyée au propriétaire ✅', 'success');
            router.replace('/bookings' as never);
          }
        },
        onError: (e) => show(toToastMessage(e, "Impossible d'envoyer la demande."), 'danger'),
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={isExtension ? "Prolonger le bail" : "Réserver ce logement"} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 16 }}
        >
          {/* Property recap */}
          <View style={{ padding: 14, borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{prop.title}</Text>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
              {/* Prix ACHETEUR : la fiche d'ou vient l'utilisateur l'affiche deja frais
                  compris — le montrer brut ici ferait BAISSER le prix de 5 %
                  d'un ecran a l'autre. */}
              {[prop.district, prop.city].filter(Boolean).join(', ')} · {formatGNF(priceWithFeeGnf(rent))}{period === 'day' ? ' /jour' : ' /mois'}
            </Text>
          </View>

          {/* PROLONGATION : la date de reprise ne se choisit pas, elle se
              constate. Afficher un calendrier serait mentir — le serveur
              recalcule de toute facon la fin du bail en cours et ignore ce que
              l'ecran envoie. On montre donc la date, verrouillee, et on explique
              d'ou elle vient. */}
          {isExtension ? (
            <View>
              <MicroLabel label="Reprise du bail" />
              <View style={{ padding: 14, borderRadius: radii.lg, backgroundColor: colors.bgSunken, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700' }}>
                  {extendStart ? `À partir du ${formatBookingDate(extendStart)}` : 'À la fin du bail en cours'}
                </Text>
                <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                  La prolongation démarre le jour où ton bail actuel se termine. Aucune nouvelle caution ne t’est demandée.
                </Text>
              </View>
            </View>
          ) : (
          <View>
            <MicroLabel label={period === 'day' ? 'Dates du séjour' : "Date d'emménagement"} />
            <BookingCalendar
              mode={period === 'day' ? 'range' : 'single'}
              startDate={startDate}
              endDate={endDate}
              onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
              blockedRanges={availability.data?.ranges ?? []}
            />
            {availability.data?.blocked_by_monthly && (
              // Un bail au mois immobilise le logement sans date de fin connue :
              // aucune plage a griser, il faut le dire en clair.
              <Text variant="micro" tone="muted" style={{ marginTop: 6, letterSpacing: 0, textTransform: 'none' }}>
                Ce logement est actuellement loué au mois.
              </Text>
            )}
            {period === 'day' && (
              <Text variant="micro" tone="muted" style={{ marginTop: 6, letterSpacing: 0, textTransform: 'none' }}>
                {startDate && !endDate
                  ? 'Choisis maintenant la date de départ.'
                  : startDate && endDate
                    ? `${nights} nuit${nights > 1 ? 's' : ''} · du ${formatBookingDate(startDate)} au ${formatBookingDate(endDate)}`
                    : "Choisis la date d'arrivée."}
              </Text>
            )}
          </View>
          )}

          {period === 'month' && (
            <View>
              <MicroLabel label="Durée du bail" />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                }}
              >
                <Pressable
                  onPress={() => { haptic.selection(); setMonths(Math.max(1, months - 1)); }}
                  style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Minus size={16} color={colors.text} strokeWidth={2.5} />
                </Pressable>
                <Text style={{ fontSize: 16, fontWeight: '700' }}>
                  {months} mois
                </Text>
                <Pressable
                  onPress={() => { haptic.selection(); setMonths(Math.min(36, months + 1)); }}
                  style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Plus size={16} color={colors.text} strokeWidth={2.5} />
                </Pressable>
              </View>
              <Text variant="micro" tone="muted" style={{ marginTop: 6, letterSpacing: 0, textTransform: 'none' }}>
                {isExtension
                  ? "1 mois de loyer payé dans l'app ; aucune nouvelle caution. Les mois suivants se règlent directement avec le propriétaire."
                  : "1er mois + caution (1 mois) payés dans l'app ; les mois suivants et la restitution de la caution se règlent directement avec le propriétaire."}
              </Text>
            </View>
          )}

          {/* Note */}
          <View>
            <MicroLabel label="Message au propriétaire (optionnel)" />
            <TextInput
              value={note}
              onChangeText={(t) => setNote(t.slice(0, 500))}
              placeholder="Présentez-vous en quelques mots…"
              placeholderTextColor={colors.textFaint}
              multiline
              style={{
                minHeight: 80,
                padding: 12,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                color: colors.text,
                fontSize: 14,
                textAlignVertical: 'top',
              }}
            />
          </View>

          {/* Price recap */}
          {ready && (
            <View style={{ padding: 14, borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
              {/* COMMISSION COMPRISE, PLUS DE LIGNE SEPAREE — client 2026-09-09 :
                  « Le prix dans Annonces affiche 1050 (prix + 5%). Mais a la
                  finalisation du paiement les deux sont dissocies. Faire comme
                  pour les Articles. » Meme forme que le recapitulatif du
                  paiement marketplace.

                  LE PRIX A LA NUIT A DISPARU DE CETTE LIGNE, ET C'EST VOULU.
                  Le serveur arrondit la commission sur le montant TOTAL du
                  sejour, jamais nuit par nuit : pour un loyer de 333 GNF sur
                  3 nuits, 350 × 3 afficherait 1 050 alors que le total vaut
                  1 049. Un ecran de paiement qui ne tombe pas juste ne se
                  rattrape pas. Le tarif a la nuit, commission comprise, est
                  deja en tete de cet ecran — rien n'est perdu.

                  LA CAUTION NE « RECOIT » PLUS LE RESTE. Depuis le 2026-09-27
                  la commission ne porte que sur le loyer : les lignes
                  s'additionnent exactement sur le total par construction, et
                  non plus par un report d'arrondi. Le depot est un nombre
                  entier a part, celui que le bailleur a declare. */}
              {period === 'day' ? (
                <RecapRow
                  label={`Séjour · ${nights} nuit${nights > 1 ? 's' : ''} (frais inclus)`}
                  value={formatGNF(rentWithFee)}
                />
              ) : (
                <RecapRow label="Premier mois de loyer (frais inclus)" value={formatGNF(rentWithFee)} />
              )}

              {/* LA REMISE, NOMMEE. Sans cette ligne le locataire verrait un
                  total plus bas que le tarif affiche sur l'annonce sans savoir
                  pourquoi — et douterait du chiffre au lieu de s'en rejouir.
                  Le detail du decoupage (« 1 mois + 2 semaines + 1 nuit ») dit
                  d'ou vient le prix, avec les nombres que le bailleur a lui-meme
                  saisis : l'addition se refait a la main. */}
              {quote.discountMinor > 0 && (
                <>
                  <RecapRow
                    label={`Tarif normal · ${formatGNF(quote.fullMinor + platformFeeGnf(quote.fullMinor))}`}
                    value={`− ${formatGNF(quote.discountMinor + platformFeeGnf(quote.fullMinor) - fees)}`}
                  />
                  {quote.parts.length > 1 && (
                    <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                      {quote.parts
                        .map((pt) =>
                          `${pt.count > 1 ? `${pt.count} × ` : ''}${pt.units === 1 ? '1 nuit' : `${pt.units} nuits`}`,
                        )
                        .join(' + ')}
                    </Text>
                  )}
                </>
              )}

              {/* LE DEPOT EST NOMME POUR CE QU'IL EST. Le bailleur choisit
                  entre une caution — qu'il rend — et des frais d'agence, qui
                  lui restent acquis. Afficher « Caution » sur des frais non
                  remboursables serait un mensonge que le contrat signe
                  repeterait. Pas de ligne a 0 : sur une prolongation, ou sur une
                  annonce sans depot, elle n'aurait rien a dire. */}
              {deposit > 0 && (
                <RecapRow
                  label={prop.depositKind === 'agency_fee' ? "Frais d'agence" : 'Caution'}
                  value={formatGNF(deposit)}
                />
              )}
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <RecapRow label="Total à payer à la signature" value={formatGNF(total)} bold />
            </View>
          )}

          {/* LE SEJOUR MINIMUM SE DIT. Un bouton grise sans explication est la
              pire des reponses : le locataire recommence sa selection sans
              comprendre, puis abandonne. Ici il lit la regle et sait quoi
              changer. Le serveur la revalide de son cote (booking-request) —
              ceci n'est qu'un confort, jamais la garde. */}
          {shortfall !== null && (
            <TrustStrip tone="accent">
              <Text style={{ color: colors.accentText, fontSize: 11.5 }}>
                <Text style={{ fontWeight: '700' }}>Séjour minimum. </Text>
                {period === 'day'
                  ? `Ce logement se loue à partir de ${shortfall} nuits.`
                  : `Ce logement se loue à partir de ${shortfall} mois.`}
              </Text>
            </TrustStrip>
          )}

          <TrustStrip tone="primary">
            <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
              <Text style={{ fontWeight: '700' }}>Paiement sécurisé. </Text>
              Ton argent reste en séquestre jusqu'à la confirmation de ton emménagement. Contacte le propriétaire pour visiter le bien avant de réserver.
            </Text>
          </TrustStrip>
        </ScrollView>

        <StickyBottom>
          <Button
            size="lg"
            block
            label={ready ? `Envoyer la demande · ${formatGNF(total)}` : 'Envoyer la demande'}
            disabled={!ready || request.isPending}
            loading={request.isPending}
            onPress={submit}
          />
        </StickyBottom>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RecapRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: 13, color: bold ? colors.text : colors.textMuted, fontWeight: bold ? '700' : '500', letterSpacing: 0 }}>
        {label}
      </Text>
      <Text style={{ fontSize: bold ? 15 : 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}
