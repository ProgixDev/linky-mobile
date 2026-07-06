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
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { EmptyState, ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
import { useAgentVisits } from '../../../src/data/queries/properties';
import { useCompleteVisit } from '../../../src/data/queries';
import { Button } from '../../../src/components/primitives/Button';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';

// Phase I.3j -- status labels resolved via i18n at render. Keys mirror the
// existing pro.status.* set EXCEPT accepted ("Confirmee" here vs "Acceptee"
// in the demandes status chip) ; the visite detail screen has used the
// CONFIRMEE wording since launch, kept as a parallel key.
const STATUS_LABEL_KEY: Record<string, string> = {
  pending: 'pro.visiteStatus.pending',
  accepted: 'pro.visiteStatus.accepted',
  rejected: 'pro.visiteStatus.rejected',
  cancelled: 'pro.visiteStatus.cancelled',
  completed: 'pro.visiteStatus.completed',
};

function formatDayLabel(iso: string, t: (k: string) => string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return t('pro.visiteDayToday');
  if (diff === 1) return t('pro.visiteDayTomorrow');
  if (diff === -1) return t('pro.visiteDayYesterday');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function VisitDetailRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const visitsQuery = useAgentVisits();
  const completeVisit = useCompleteVisit();
  const { show } = useToast();
  const visits = visitsQuery.data ?? [];
  const visit = visits.find((v) => v.id === id);

  // Phase U.0d follow-up — gate error early-return on !visit so a failed
  // background refetch doesn't hide a cached visit the user just tapped
  // from the (rendered) list screen. Same pattern as the list-side guards.
  if (visitsQuery.isError && !visit) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('pro.visiteDetailTitle')} />
        <ErrorStateView onRetry={() => void visitsQuery.refetch()} />
      </SafeAreaView>
    );
  }

  if (visitsQuery.isLoading && !visit) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('pro.visiteDetailTitle')} />
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
        <ScreenHeader title={t('pro.visiteDetailTitle')} />
        <EmptyState
          icon="package"
          title={t('pro.visiteDetailNotFoundTitle')}
          description={t('pro.visiteDetailNotFoundBody')}
          ctaLabel={t('pro.visiteDetailBack')}
          onCta={() => (router.canGoBack() ? router.back() : router.replace('/pro/visites'))}
        />
      </SafeAreaView>
    );
  }

  const dayLabel = formatDayLabel(visit.requestedAt, t);
  const timeLabel = formatTime(visit.requestedAt);
  const statusLabel = STATUS_LABEL_KEY[visit.status]
    ? t(STATUS_LABEL_KEY[visit.status])
    : visit.status.toUpperCase();
  const buyerName = visit.buyer?.displayName ?? t('pro.visiteFallbackBuyer');
  const propertyTitle = visit.property?.title;
  const locationLabel = [visit.property?.district, visit.property?.city].filter(Boolean).join(', ');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader title={t('pro.visiteDetailTitle')} subtitle={statusLabel} />

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
        <Section title={t('pro.visiteSectionBuyer')}>
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
                {t('pro.visiteContactHint')}
              </Text>
            </View>
          </View>
        </Section>

        {/* Note */}
        {visit.note ? (
          <Section title={t('pro.visiteSectionNote')}>
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
        <Section title={t('pro.visiteSectionProperty')}>
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
              {propertyTitle ?? t('pro.visiteFallbackProperty')}
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
              {t('pro.visiteSeeListing')}
            </Text>
          </Pressable>
        </Section>

        {/* Mark-completed — the writer of visit_requests.status='completed'.
            Required by the achat/vente rule: a completed visit is the
            precondition for any on-app transaction. */}
        {visit.status === 'accepted' && (
          <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
            <Button
              size="lg"
              block
              label={completeVisit.isPending ? 'Enregistrement…' : 'Marquer la visite comme effectuée'}
              disabled={completeVisit.isPending}
              onPress={() =>
                completeVisit.mutate(visit.id, {
                  onSuccess: () => show('Visite marquée comme effectuée ✅', 'success'),
                  onError: (e) => show(toToastMessage(e, 'Action impossible.'), 'danger'),
                })
              }
            />
          </View>
        )}
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
