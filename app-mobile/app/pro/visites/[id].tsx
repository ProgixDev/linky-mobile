// Phase U.0-B4 — pre-U0 this rendered mockProperties[0] as the property
// card (client saw a fabricated bien with a fake price), photos.woman1 +
// Mariama Diallo as the client, AUJOURD'HUI · 15 MAI / 14:30 hardcoded,
// and "Marquer comme terminée" / "Annuler" buttons that were
// haptic-only no-ops. Now: real data from useAgentVisits (joined
// property + buyer + note + requestedAt), real /property/${id} link,
// real date+time. Terminate / Reschedule / Cancel are HIDDEN until a
// real backend endpoint exists ; the list screen handles pending
// accept/reject via the existing visit-respond fn.
import { ScrollView, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Clock, MapPin, User as UserIcon } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { EmptyState, ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
import { useAgentVisits } from '../../../src/data/queries/properties';

const STATUS_LABEL: Record<string, string> = {
  pending: 'EN ATTENTE',
  accepted: 'CONFIRMÉE',
  rejected: 'REFUSÉE',
  cancelled: 'ANNULÉE',
  completed: 'TERMINÉE',
};

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "AUJOURD'HUI";
  if (diff === 1) return 'DEMAIN';
  if (diff === -1) return 'HIER';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function VisitDetailRoute() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const visitsQuery = useAgentVisits();
  const visits = visitsQuery.data ?? [];
  const visit = visits.find((v) => v.id === id);

  if (visitsQuery.isError) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Visite" />
        <ErrorStateView onRetry={() => void visitsQuery.refetch()} />
      </SafeAreaView>
    );
  }

  if (visitsQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Visite" />
        <View style={{ paddingHorizontal: 24, gap: 14, paddingTop: 8 }}>
          <Skeleton height={90} radius={20} />
          <Skeleton height={72} radius={18} />
          <Skeleton height={90} radius={18} />
        </View>
      </SafeAreaView>
    );
  }

  if (!visit) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Visite" />
        <EmptyState
          icon="package"
          title="Visite introuvable"
          description="Cette demande de visite n'existe plus ou a été retirée."
          ctaLabel="Retour"
          onCta={() => (router.canGoBack() ? router.back() : router.replace('/pro/visites'))}
        />
      </SafeAreaView>
    );
  }

  const dayLabel = formatDayLabel(visit.requestedAt);
  const timeLabel = formatTime(visit.requestedAt);
  const statusLabel = STATUS_LABEL[visit.status] ?? visit.status.toUpperCase();
  const buyerName = visit.buyer?.displayName ?? 'Acheteur';
  const propertyTitle = visit.property?.title;
  const locationLabel = [visit.property?.district, visit.property?.city].filter(Boolean).join(', ');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader title="Visite" subtitle={statusLabel} />

        {/* When */}
        <View style={{ paddingHorizontal: 24 }}>
          <View
            style={{
              padding: 18,
              borderRadius: 22,
              backgroundColor: colors.primarySoft,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CalendarDays size={22} color="#FFFFFF" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.primaryDeep,
                  letterSpacing: 0.5,
                  opacity: 0.75,
                }}
              >
                {dayLabel}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <Clock size={18} color={colors.primaryDeep} strokeWidth={2} />
                <Text
                  style={{
                    fontSize: 26,
                    fontWeight: '700',
                    color: colors.primaryDeep,
                    letterSpacing: -0.4,
                    fontVariant: ['tabular-nums'],
                    lineHeight: 30,
                    includeFontPadding: false,
                  }}
                >
                  {timeLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Buyer */}
        <Section title="Demandeur">
          <View
            style={{
              padding: 14,
              borderRadius: 18,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                backgroundColor: colors.bgSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserIcon size={22} color={colors.textMuted} strokeWidth={1.75} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: colors.text,
                  letterSpacing: 0,
                  lineHeight: 18,
                  includeFontPadding: false,
                }}
              >
                {buyerName}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.textMuted,
                  marginTop: 2,
                  letterSpacing: 0,
                }}
              >
                Contact via la messagerie Linky
              </Text>
            </View>
          </View>
        </Section>

        {/* Note */}
        {visit.note ? (
          <Section title="Note du demandeur">
            <View
              style={{
                padding: 14,
                borderRadius: 18,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text variant="bodyM" style={{ lineHeight: 21 }}>
                {visit.note}
              </Text>
            </View>
          </Section>
        ) : null}

        {/* Property */}
        <Section title="Bien à visiter">
          <Pressable
            onPress={() => router.push(`/property/${visit.propertyId}`)}
            style={{
              padding: 14,
              borderRadius: 18,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 6,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: colors.text,
                letterSpacing: 0,
                lineHeight: 18,
                includeFontPadding: false,
              }}
              numberOfLines={2}
            >
              {propertyTitle ?? 'Voir le bien'}
            </Text>
            {locationLabel.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MapPin size={11} color={colors.textMuted} strokeWidth={2} />
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  {locationLabel}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.primary, marginTop: 4 }}>
              Voir l'annonce →
            </Text>
          </Pressable>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingTop: 22 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: colors.textFaint,
          letterSpacing: 0.6,
          paddingHorizontal: 28,
          marginBottom: 10,
        }}
      >
        {title.toUpperCase()}
      </Text>
      <View style={{ paddingHorizontal: 24 }}>{children}</View>
    </View>
  );
}
