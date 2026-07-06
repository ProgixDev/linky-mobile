// Shared booking UI: status chip meta, list card, contract view, event timeline.
// Used by the tenant screens (/bookings) and the landlord screens (/agent/leases).
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { CalendarDays, Check, Clock, FileText, X as XIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { formatGNF } from '../../lib/format';
import type { Booking, BookingStatus } from '../../data/types';

type Colors = ReturnType<typeof useTheme>['colors'];

export const BOOKING_STATUS_META: Record<string, {
  label: string;
  Icon: typeof Check | null;
  bg: (c: Colors) => string;
  fg: (c: Colors) => string;
}> = {
  requested: { label: 'En attente',        Icon: Clock, bg: (c) => c.accentSoft,  fg: (c) => c.accentText },
  accepted:  { label: 'À signer & payer',  Icon: FileText, bg: (c) => c.primarySoft, fg: (c) => c.primaryDeep },
  rejected:  { label: 'Refusée',           Icon: XIcon, bg: () => 'rgba(209,79,60,0.12)', fg: (c) => c.danger },
  cancelled: { label: 'Annulée',           Icon: XIcon, bg: (c) => c.bgSunken, fg: (c) => c.textMuted },
  paid:      { label: 'Payée — séquestre', Icon: Check, bg: (c) => c.primarySoft, fg: (c) => c.primaryDeep },
  active:    { label: 'Bail actif',        Icon: Check, bg: (c) => c.primarySoft, fg: (c) => c.primaryDeep },
  completed: { label: 'Terminée',          Icon: Check, bg: (c) => c.bgSunken, fg: (c) => c.textMuted },
  disputed:  { label: 'Litige',            Icon: Clock, bg: () => 'rgba(209,79,60,0.12)', fg: (c) => c.danger },
  refunded:  { label: 'Remboursée',        Icon: Check, bg: (c) => c.bgSunken, fg: (c) => c.textMuted },
};

export function BookingStatusChip({ status }: { status: BookingStatus }) {
  const { colors } = useTheme();
  const meta = BOOKING_STATUS_META[status] ?? BOOKING_STATUS_META.requested;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        paddingHorizontal: 8,
        height: 22,
        borderRadius: 999,
        backgroundColor: meta.bg(colors),
      }}
    >
      {meta.Icon && <meta.Icon size={11} color={meta.fg(colors)} strokeWidth={2.25} />}
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: meta.fg(colors), letterSpacing: 0.3, lineHeight: 12, includeFontPadding: false }}>
        {meta.label}
      </Text>
    </View>
  );
}

export function bookingPeriodText(b: Booking): string {
  if (b.period === 'day') return `Du ${b.startDate} au ${b.endDate}`;
  return `À partir du ${b.startDate} · ${b.months ?? 1} mois`;
}

export function BookingCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const { colors } = useTheme();
  const cover = booking.property?.cover_url ?? null;
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 12,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        gap: 12,
      }}
    >
      {cover ? (
        <Image source={cover} style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.bgSunken }} contentFit="cover" />
      ) : (
        <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
          <CalendarDays size={22} color={colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '700', lineHeight: 17, includeFontPadding: false }} numberOfLines={1}>
          {booking.property?.title ?? 'Logement'}
        </Text>
        <Text style={{ fontSize: 11.5, color: colors.textMuted, letterSpacing: 0 }} numberOfLines={1}>
          {bookingPeriodText(booking)}
        </Text>
        <Text style={{ fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {formatGNF(booking.totalGnf)}
        </Text>
      </View>
      <View style={{ alignSelf: 'flex-start' }}>
        <BookingStatusChip status={booking.status} />
      </View>
    </Pressable>
  );
}

export function ContractView({ booking }: { booking: Booking }) {
  const { colors, radii } = useTheme();
  const c = booking.contract;
  if (!c) return null;
  return (
    <View style={{ padding: 14, borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FileText size={16} color={colors.primary} strokeWidth={2} />
        <Text style={{ fontSize: 14, fontWeight: '700' }}>Contrat de location</Text>
      </View>
      <ContractRow k="Propriétaire" v={c.landlord_name} />
      <ContractRow k="Locataire" v={c.tenant_name} />
      <ContractRow k="Bien" v={c.property_title} />
      <ContractRow k="Adresse" v={c.property_location} />
      <ContractRow k="Période" v={c.period === 'day' ? `Du ${c.start_date} au ${c.end_date}` : `${c.months} mois à partir du ${c.start_date}`} />
      <ContractRow k={c.period === 'day' ? 'Loyer / jour' : 'Loyer / mois'} v={formatGNF(c.rent_minor)} />
      <ContractRow k="Montant" v={formatGNF(c.amount_minor)} />
      <ContractRow k="Frais de service (3%)" v={formatGNF(c.fees_minor)} />
      <ContractRow k="Total à la signature" v={formatGNF(c.total_minor)} bold />
      <View style={{ height: 1, backgroundColor: colors.border }} />
      {c.clauses.map((cl, i) => (
        <Text key={i} style={{ fontSize: 11.5, color: colors.textMuted, lineHeight: 17, letterSpacing: 0 }}>
          {i + 1}. {cl}
        </Text>
      ))}
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <ContractRow
        k="Signature propriétaire"
        v={booking.landlordSignedAt ? `✔ ${new Date(booking.landlordSignedAt).toLocaleDateString('fr-FR')}` : 'En attente'}
      />
      <ContractRow
        k="Signature locataire"
        v={booking.tenantSignedAt ? `✔ ${new Date(booking.tenantSignedAt).toLocaleDateString('fr-FR')}` : 'En attente'}
      />
    </View>
  );
}

function ContractRow({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontSize: 12, color: colors.textMuted, letterSpacing: 0 }}>{k}</Text>
      <Text style={{ fontSize: 12, fontWeight: bold ? '700' : '600', flexShrink: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  );
}

export function BookingTimeline({ booking }: { booking: Booking }) {
  const { colors } = useTheme();
  const events = booking.events ?? [];
  if (events.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {events.map((e, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.primary, marginTop: 4 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, color: colors.text, letterSpacing: 0, lineHeight: 17 }}>{e.label}</Text>
            <Text variant="micro" tone="faint" style={{ letterSpacing: 0, textTransform: 'none' }}>
              {new Date(e.at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
