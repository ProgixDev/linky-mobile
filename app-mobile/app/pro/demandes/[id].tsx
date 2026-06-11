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

const STATUS_LABEL: Record<string, string> = {
  pending: 'EN ATTENTE',
  accepted: 'ACCEPTÉE',
  rejected: 'REFUSÉE',
  cancelled: 'ANNULÉE',
  completed: 'TERMINÉE',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `Aujourd'hui · ${time}`;
  if (diff === 1) return `Demain · ${time}`;
  const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${dayLabel} · ${time}`;
}

export default function DemandDetailRoute() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const visitsQuery = useAgentVisits();
  const respond = useRespondVisitRequest();
  const toast = useToast();
  const [submitting, setSubmitting] = useState<'accept' | 'reject' | null>(null);

  if (visitsQuery.isError) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Demande" />
        <ErrorStateView onRetry={() => void visitsQuery.refetch()} />
      </SafeAreaView>
    );
  }

  if (visitsQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Demande" />
        <View style={{ paddingHorizontal: 24, gap: 14, paddingTop: 8 }}>
          <Skeleton height={72} radius={18} />
          <Skeleton height={90} radius={18} />
          <Skeleton height={90} radius={18} />
        </View>
      </SafeAreaView>
    );
  }

  const visit = (visitsQuery.data ?? []).find((v) => v.id === id);
  if (!visit) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Demande" />
        <EmptyState
          icon="package"
          title="Demande introuvable"
          description="Cette demande n'existe plus ou a été retirée."
          ctaLabel="Retour"
          onCta={() => (router.canGoBack() ? router.back() : router.replace('/pro/demandes'))}
        />
      </SafeAreaView>
    );
  }

  const buyerName = visit.buyer?.displayName ?? 'Demandeur';
  const whenLabel = formatWhen(visit.requestedAt);
  const propertyTitle = visit.property?.title;
  const locationLabel = [visit.property?.district, visit.property?.city].filter(Boolean).join(', ');
  const canDecide = visit.status === 'pending';

  const onRespond = async (decision: 'accept' | 'reject') => {
    if (!canDecide || respond.isPending) return;
    setSubmitting(decision);
    try {
      await respond.mutateAsync({ visit_request_id: visit.id, decision });
      toast.show(decision === 'accept' ? 'Visite acceptée.' : 'Visite refusée.', 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/pro/demandes');
    } catch (e) {
      toast.show(toToastMessage(e, "Impossible d'enregistrer la réponse."), 'danger');
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
        <ScreenHeader title="Demande" subtitle={STATUS_LABEL[visit.status] ?? visit.status.toUpperCase()} />

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
                Contact via la messagerie Linky
              </Text>
            </View>
          </View>
        </View>

        {/* Date demandée */}
        <Section title="Date souhaitée">
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
          <Section title="Message">
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
        <Section title="Bien concerné">
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
              {propertyTitle ?? "Voir l'annonce"}
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
            label="Refuser"
            leading={<X size={16} color={colors.danger} strokeWidth={2} />}
            onPress={() => onRespond('reject')}
            loading={submitting === 'reject'}
            disabled={respond.isPending}
          />
          <Button
            variant="dark"
            size="lg"
            style={{ flex: 1.4 }}
            label="Accepter"
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
