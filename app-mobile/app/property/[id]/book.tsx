// Tenant booking wizard — location par jour (date range) or par mois (move-in
// date + duration). Shows the live price recap (rent + 3% frais de service),
// then sends the request to the landlord (booking-request). The visit stays
// OPTIONAL for rentals ; achat/vente keeps the mandatory-visit rule.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
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
import { useProperty, useRequestBooking } from '../../../src/data/queries';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { formatGNF } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';

function nightsBetween(start: string, end: string): number {
  return Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000);
}

export default function BookPropertyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, radii } = useTheme();
  const { data: prop, isLoading, isError, refetch } = useProperty(id);
  const request = useRequestBooking();
  const { show } = useToast();

  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [months, setMonths] = useState(12);
  const [note, setNote] = useState('');

  const period: 'day' | 'month' = prop?.perMonth ? 'month' : 'day';
  const rent = prop?.priceGnf ?? 0;

  const { nights, amount, fees, total, ready } = useMemo(() => {
    if (period === 'day') {
      if (!startDate || !endDate) return { nights: 0, amount: 0, fees: 0, total: 0, ready: false };
      const n = nightsBetween(startDate, endDate);
      const a = n * rent;
      const f = Math.round(a * 0.03);
      return { nights: n, amount: a, fees: f, total: a + f, ready: n >= 1 && n <= 90 };
    }
    if (!startDate) return { nights: 0, amount: 0, fees: 0, total: 0, ready: false };
    const f = Math.round(rent * 0.03);
    return { nights: 0, amount: rent, fees: f, total: rent + f, ready: true };
  }, [period, startDate, endDate, rent]);

  if (isLoading || isError || !prop) {
    return <DetailStateScreen loading={isLoading} title="Réserver" onRetry={() => void refetch()} />;
  }
  if (prop.type !== 'location') {
    // Achat/vente : pas de réservation en ligne — la visite est obligatoire.
    return <DetailStateScreen loading={false} title="Réserver" onRetry={() => router.back()} />;
  }

  const submit = () => {
    if (!ready || request.isPending || !startDate) return;
    haptic.medium();
    request.mutate(
      {
        propertyId: prop.id,
        period,
        startDate,
        ...(period === 'day' ? { endDate: endDate! } : { months }),
        note,
      },
      {
        onSuccess: () => {
          show('Demande envoyée au propriétaire ✅', 'success');
          router.replace('/bookings' as never);
        },
        onError: (e) => show(toToastMessage(e, "Impossible d'envoyer la demande."), 'danger'),
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Réserver ce logement" back />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 16 }}
      >
        {/* Property recap */}
        <View style={{ padding: 14, borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{prop.title}</Text>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
            {[prop.district, prop.city].filter(Boolean).join(', ')} · {formatGNF(rent)}{period === 'day' ? ' /jour' : ' /mois'}
          </Text>
        </View>

        <View>
          <MicroLabel label={period === 'day' ? 'Dates du séjour' : "Date d'emménagement"} />
          <BookingCalendar
            mode={period === 'day' ? 'range' : 'single'}
            startDate={startDate}
            endDate={endDate}
            onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
          />
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
              Le 1er mois se paie dans l'app à la signature ; les mois suivants directement au propriétaire.
            </Text>
          </View>
        )}

        {/* Note */}
        <View>
          <MicroLabel label="Message au propriétaire (optionnel)" />
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, 500))}
            placeholder="Présente-toi en quelques mots…"
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
            <RecapRow label={period === 'day' ? `${formatGNF(rent)} × ${nights} nuit${nights > 1 ? 's' : ''}` : 'Premier mois de loyer'} value={formatGNF(amount)} />
            <RecapRow label="Frais de service (3%)" value={formatGNF(fees)} />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <RecapRow label="Total à payer à la signature" value={formatGNF(total)} bold />
          </View>
        )}

        <TrustStrip tone="primary">
          <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
            <Text style={{ fontWeight: '700' }}>Paiement sécurisé. </Text>
            Ton argent reste en séquestre jusqu'à la confirmation de ton emménagement. La visite du bien reste possible avant de réserver.
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
