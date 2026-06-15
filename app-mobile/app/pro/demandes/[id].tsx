// Phase U.0-B5 — pre-U0 this rendered a fully fabricated negotiation chat
// reachable from REAL rows: hardcoded Mariama messages with fake GNF amounts
// (3 800 000 / 4 000 000), mockProperties[0], an "OFFRE REÇUE" card off the
// mock price, dead Accepter/Refuser, route param `id` read but never used.
// Now: render the real visit (useAgentVisits row : buyer.displayName, note,
// requestedAt, joined property), with accept/reject wired to the real
// visit-respond mutation. The fake "messages" UI and composer are deleted —
// messaging-to-visits linkage is a V1.1 feature.
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, X, CalendarDays, MapPin, User as UserIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { EmptyState, ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
import {
  useAgentVisits,
  useRespondVisitRequest,
} from '../../../src/data/queries/properties';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';

// Phase I.8 — status labels resolved via i18n at render. The pro screens
// share pro.status.* keys.
const STATUS_LABEL_KEY: Record<string, string> = {
  pending: 'pro.status.pending',
  accepted: 'pro.status.accepted',
  rejected: 'pro.status.declined',
  cancelled: 'pro.status.cancelled',
  completed: 'pro.status.completed',
};

function formatWhen(iso: string, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return t('pro.demandeWhenToday', { time });
  if (diff === 1) return t('pro.demandeWhenTomorrow', { time });
  const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  return t('pro.demandeWhenOther', { day: dayLabel, time });
}

export default function DemandDetailRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const visitsQuery = useAgentVisits();
  const respond = useRespondVisitRequest();
  const toast = useToast();
  const [submitting, setSubmitting] = useState<'accept' | 'reject' | null>(null);

  // Phase U.0d follow-up — resolve the cached visit BEFORE the
  // error/loading checks so a failed background refetch doesn't hide a
  // visit the user just tapped from the rendered list.
  const visit = (visitsQuery.data ?? []).find((v) => v.id === id);

  if (visitsQuery.isError && !visit) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('pro.demandeDetailTitle')} />
        <ErrorStateView onRetry={() => void visitsQuery.refetch()} />
      </SafeAreaView>
    );
  }

  if (visitsQuery.isLoading && !visit) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('pro.demandeDetailTitle')} />
        <View style={{ paddingHorizontal: 24, gap: 14, paddingTop: 8 }}>
          <Skeleton height={72} radius={18} />
          <Skeleton height={90} radius={18} />
          <Skeleton height={90} radius={18} />
        </View>
      </SafeAreaView>
    );
  }

  if (!visit) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('pro.demandeDetailTitle')} />
        <EmptyState
          icon="package"
          title={t('pro.demandeDetailNotFoundTitle')}
          description={t('pro.demandeDetailNotFoundBody')}
          ctaLabel={t('common.back')}
          onCta={() => (router.canGoBack() ? router.back() : router.replace('/pro/demandes'))}
        />
      </SafeAreaView>
    );
  }

  const buyerName = visit.buyer?.displayName ?? t('pro.demandeDetailFallbackBuyer');
  const whenLabel = formatWhen(visit.requestedAt, t);
  const propertyTitle = visit.property?.title;
  const locationLabel = [visit.property?.district, visit.property?.city].filter(Boolean).join(', ');
  const canDecide = visit.status === 'pending';

  const onRespond = async (decision: 'accept' | 'reject') => {
    if (!canDecide || respond.isPending) return;
    setSubmitting(decision);
    try {
      await respond.mutateAsync({ visit_request_id: visit.id, decision });
      toast.show(decision === 'accept' ? t('pro.demandeAcceptToast') : t('pro.demandeRejectToast'), 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/pro/demandes');
    } catch (e) {
      toast.show(toToastMessage(e, t('pro.demandeRespondError')), 'danger');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader title={t('pro.demandeDetailTitle')} subtitle={STATUS_LABEL_KEY[visit.status] ? t(STATUS_LABEL_KEY[visit.status]) : visit.status.toUpperCase()} />

        {/* Demandeur */}
        <View style={{ paddingHorizontal: 24 }}>
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
                width: 48,
                height: 48,
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
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                {t('pro.demandeDetailContactHint')}
              </Text>
            </View>
          </View>
        </View>

        {/* Date demandée */}
        <Section title={t('pro.demandeDetailSectionDate')}>
          <View
            style={{
              padding: 14,
              borderRadius: 18,
              backgroundColor: colors.primarySoft,
              flexDirection: 'row',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <CalendarDays size={18} color={colors.primaryDeep} strokeWidth={2} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primaryDeep }}>
              {whenLabel}
            </Text>
          </View>
        </Section>

        {/* Note */}
        {visit.note ? (
          <Section title={t('pro.demandeDetailSectionMessage')}>
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

        {/* Bien */}
        <Section title={t('pro.demandeDetailSectionProperty')}>
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
              {propertyTitle ?? t('pro.demandeDetailViewListingFallback')}
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
              {t('pro.demandeDetailViewProperty')}
            </Text>
          </Pressable>
        </Section>
      </ScrollView>

      {canDecide && (
        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.bg,
            flexDirection: 'row',
            gap: 10,
          }}
        >
          <Button
            variant="outline"
            size="lg"
            style={{ flex: 1 }}
            label={t('pro.decline')}
            leading={<X size={16} color={colors.danger} strokeWidth={2} />}
            onPress={() => onRespond('reject')}
            loading={submitting === 'reject'}
            disabled={respond.isPending}
          />
          <Button
            variant="dark"
            size="lg"
            style={{ flex: 1.4 }}
            label={t('pro.accept')}
            leading={<Check size={16} color={colors.bg} strokeWidth={2.25} />}
            onPress={() => onRespond('accept')}
            loading={submitting === 'accept'}
            disabled={respond.isPending}
          />
        </View>
      )}
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
