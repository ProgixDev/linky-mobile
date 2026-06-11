import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { Check, MapPin, X } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { useToast } from '../../../src/components/feedback/Toast';
import { haptic } from '../../../src/lib/haptics';
import { toToastMessage } from '../../../src/lib/api';
import { useAgentVisits, useRespondVisitRequest } from '../../../src/data/queries/properties';
import type { VisitRequest } from '../../../src/data/queries/properties';

const STATUS_META: Record<string, { label: string; bg: 'accent' | 'primary' | 'danger' | 'muted' }> = {
  pending: { label: 'EN ATTENTE', bg: 'accent' },
  accepted: { label: 'CONFIRMÉ', bg: 'primary' },
  rejected: { label: 'REFUSÉ', bg: 'danger' },
  cancelled: { label: 'ANNULÉ', bg: 'muted' },
  completed: { label: 'TERMINÉ', bg: 'muted' },
};

function dayBucketFr(iso: string): { key: string; label: string; sub: string } {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const sub = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '');
  if (diffDays === 0) return { key: 'today', label: "Aujourd'hui", sub };
  if (diffDays === 1) return { key: 'tomorrow', label: 'Demain', sub };
  if (diffDays > 1 && diffDays < 7) {
    return { key: `d${diffDays}`, label: d.toLocaleDateString('fr-FR', { weekday: 'long' }), sub };
  }
  if (diffDays < 0) return { key: `past_${diffDays}`, label: 'Passé', sub };
  return { key: `d${diffDays}`, label: sub, sub };
}

function timeFr(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function VisitesIndex() {
  const { colors } = useTheme();
  const visitsQuery = useAgentVisits();
  const visits = visitsQuery.data ?? [];
  const isLoading = visitsQuery.isLoading;

  const grouped = visits.reduce<Record<string, { label: string; sub: string; items: VisitRequest[] }>>(
    (acc, v) => {
      const b = dayBucketFr(v.requestedAt);
      if (!acc[b.key]) acc[b.key] = { label: b.label, sub: b.sub, items: [] };
      acc[b.key].items.push(v);
      return acc;
    },
    {},
  );

  const pendingCount = visits.filter((v) => v.status === 'pending').length;
  const acceptedCount = visits.filter((v) => v.status === 'accepted').length;
  const todayCount = visits.filter((v) => dayBucketFr(v.requestedAt).key === 'today').length;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={visitsQuery.isFetching && !isLoading}
            onRefresh={() => void visitsQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <ScreenHeader title="Visites" subtitle="Tes demandes de visite et confirmations." />

        <View style={{ paddingHorizontal: 24, flexDirection: 'row', gap: 10, marginBottom: 22 }}>
          <SummaryStat label="Aujourd'hui" value={String(todayCount)} tone="accent" />
          <SummaryStat label="Confirmées" value={String(acceptedCount)} />
          <SummaryStat label="En attente" value={String(pendingCount)} />
        </View>

        {visitsQuery.isError && (
          <View style={{ paddingTop: 20 }}>
            <ErrorStateView onRetry={() => void visitsQuery.refetch()} />
          </View>
        )}

        {isLoading && (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        )}

        {!isLoading && visits.length === 0 && (
          <View style={{ paddingHorizontal: 24, paddingVertical: 32 }}>
            <Text tone="muted" style={{ textAlign: 'center' }}>
              Aucune demande de visite pour l&apos;instant.
            </Text>
          </View>
        )}

        {Object.entries(grouped).map(([key, group]) => (
          <View key={key} style={{ marginBottom: 22 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: 8,
                paddingHorizontal: 24,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.2 }}>
                {group.label}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, letterSpacing: 0 }}>· {group.sub}</Text>
            </View>
            <View style={{ paddingHorizontal: 24, gap: 10 }}>
              {group.items.map((v) => (
                <VisitCard key={v.id} visit={v} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: 'accent' }) {
  const { colors } = useTheme();
  const accent = tone === 'accent';
  return (
    <View
      style={{
        flex: 1,
        padding: 12,
        borderRadius: 16,
        backgroundColor: accent ? colors.accentSoft : colors.card,
        borderWidth: 1,
        borderColor: accent ? 'transparent' : colors.border,
      }}
    >
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: accent ? colors.accentText : colors.textFaint, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          fontSize: 22,
          fontWeight: '700',
          color: accent ? colors.accentText : colors.text,
          marginTop: 4,
          fontVariant: ['tabular-nums'],
          letterSpacing: -0.3,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function VisitCard({ visit }: { visit: VisitRequest }) {
  const { colors } = useTheme();
  const respond = useRespondVisitRequest();
  const toast = useToast();
  const meta = STATUS_META[visit.status] ?? STATUS_META.pending;
  const pending = visit.status === 'pending';

  const pillBg =
    meta.bg === 'accent'
      ? colors.accentSoft
      : meta.bg === 'primary'
        ? colors.primarySoft
        : meta.bg === 'danger'
          ? 'rgba(209,79,60,0.12)'
          : colors.bgSunken;
  const pillFg =
    meta.bg === 'accent'
      ? colors.accentText
      : meta.bg === 'primary'
        ? colors.primaryDeep
        : meta.bg === 'danger'
          ? colors.danger
          : colors.textMuted;

  const onDecide = async (decision: 'accept' | 'reject') => {
    if (respond.isPending) return;
    try {
      haptic.medium();
      await respond.mutateAsync({ visit_request_id: visit.id, decision });
      toast.show(decision === 'accept' ? 'Visite confirmée' : 'Demande refusée', 'success');
    } catch (e: unknown) {
      console.error('[visit-respond] error:', e);
      toast.show(toToastMessage(e, 'Action impossible'), 'danger');
    }
  };

  return (
    <Pressable
      onPress={() => {
        if (pending) return; // pending decisions live inline; only accepted/closed cards drill into detail
        haptic.light();
        router.push(`/pro/visites/${visit.id}`);
      }}
      style={{
        padding: 14,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 56, paddingTop: 4, alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.text,
              fontVariant: ['tabular-nums'],
              letterSpacing: -0.2,
              lineHeight: 22,
              includeFontPadding: false,
            }}
          >
            {timeFr(visit.requestedAt)}
          </Text>
          <View
            style={{
              marginTop: 6,
              paddingHorizontal: 6,
              height: 18,
              borderRadius: 999,
              backgroundColor: pillBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: '700',
                color: pillFg,
                lineHeight: 11,
                includeFontPadding: false,
                letterSpacing: 0.3,
              }}
            >
              {meta.label}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 13.5,
              fontWeight: '700',
              color: colors.text,
              letterSpacing: 0,
              lineHeight: 16,
              includeFontPadding: false,
            }}
          >
            {visit.buyer?.displayName || 'Acheteur'}
          </Text>
          {visit.property && (
            <Text
              style={{ fontSize: 13, color: colors.text, marginTop: 8, letterSpacing: 0, lineHeight: 17 }}
              numberOfLines={1}
            >
              {visit.property.title}
            </Text>
          )}
          {visit.property && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <MapPin size={11} color={colors.textMuted} strokeWidth={2} />
              <Text style={{ fontSize: 11.5, color: colors.textMuted, letterSpacing: 0 }} numberOfLines={1}>
                {visit.property.district ? `${visit.property.district}, ` : ''}
                {visit.property.city}
              </Text>
            </View>
          )}
          {visit.note ? (
            <Text
              style={{ fontSize: 12, color: colors.textMuted, marginTop: 6, fontStyle: 'italic' }}
              numberOfLines={2}
            >
              « {visit.note} »
            </Text>
          ) : null}
        </View>
      </View>

      {pending && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <Pressable
            disabled={respond.isPending}
            onPress={() => onDecide('reject')}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(209,79,60,0.4)',
              backgroundColor: 'rgba(209,79,60,0.06)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: respond.isPending ? 0.55 : 1,
            }}
          >
            <X size={14} color={colors.danger} strokeWidth={2.25} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger, lineHeight: 15 }}>
              Refuser
            </Text>
          </Pressable>
          <Pressable
            disabled={respond.isPending}
            onPress={() => onDecide('accept')}
            style={{
              flex: 1.4,
              height: 42,
              borderRadius: 12,
              backgroundColor: colors.primary,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: respond.isPending ? 0.55 : 1,
            }}
          >
            <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', lineHeight: 15 }}>
              Accepter
            </Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}
