import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
import { Image } from 'expo-image';
import { CalendarDays, Clock, CheckCircle2, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';
import { useAgentVisits } from '../../../src/data/queries';
import type { VisitRequest, VisitStatus } from '../../../src/data/queries/properties';
import { formatRelativeFR } from '../../../src/lib/format';

type Filter = 'all' | 'pending' | 'accepted' | 'rejected';

const FILTERS: { id: Filter; label: string; statuses?: VisitStatus[] }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'pending', label: 'À répondre', statuses: ['pending'] },
  { id: 'accepted', label: 'Acceptées', statuses: ['accepted'] },
  { id: 'rejected', label: 'Refusées', statuses: ['rejected', 'cancelled'] },
];

const STATUS_META: Record<
  string,
  { label: string; Icon: LucideIcon; bg: string; fg: string }
> = {
  pending: { label: 'EN ATTENTE', Icon: Clock, bg: '#FCF1DC', fg: '#8B5A0A' },
  accepted: { label: 'ACCEPTÉE', Icon: CheckCircle2, bg: '#E0F0E8', fg: '#155F45' },
  rejected: { label: 'REFUSÉE', Icon: X, bg: '#FBE7E5', fg: '#B53D2F' },
  cancelled: { label: 'ANNULÉE', Icon: X, bg: '#EEEEEE', fg: '#606060' },
  completed: { label: 'TERMINÉE', Icon: CheckCircle2, bg: '#E8F2EE', fg: '#0A5240' },
};

export default function DemandesIndex() {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const visitsQuery = useAgentVisits();
  const visits = visitsQuery.data;
  const isLoading = visitsQuery.isLoading;

  const filtered = useMemo(() => {
    const list = visits ?? [];
    const f = FILTERS.find((x) => x.id === filter);
    if (!f?.statuses) return list;
    return list.filter((v) => f.statuses!.includes(v.status as VisitStatus));
  }, [visits, filter]);

  const unreadCount = (visits ?? []).filter((v) => v.status === 'pending').length;
  // U.0d — subtitle error arm gated on "no cached data" so a failed
  // pull-to-refresh keeps the unread count visible.
  const subtitle = visitsQuery.isError && (!visits || visits.length === 0)
    ? "Impossible de charger tes demandes."
    : isLoading
      ? 'Chargement…'
      : unreadCount > 0
        ? `${unreadCount} demande${unreadCount > 1 ? 's' : ''} en attente de réponse.`
        : 'Aucune demande en attente.';

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
        <ScreenHeader title="Demandes" subtitle={subtitle} />

        {/* Phase U.0 should-fix — exclusive error : chips + empty state
            stopped rendering during the error so the user sees one clear
            "Une erreur est survenue" affordance. U.0d — gate also on
            "no cached data" so a failed pull-to-refresh doesn't nuke
            a populated list. */}
        {visitsQuery.isError && (!visits || visits.length === 0) ? (
          <View style={{ paddingTop: 20 }}>
            <ErrorStateView onRetry={() => void visitsQuery.refetch()} />
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 24,
                gap: 8,
                paddingBottom: 16,
              }}
            >
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => {
                      haptic.selection();
                      setFilter(f.id);
                    }}
                    style={{
                      height: 36,
                      paddingHorizontal: 14,
                      borderRadius: 999,
                      backgroundColor: active ? colors.text : colors.card,
                      borderWidth: 1,
                      borderColor: active ? colors.text : colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: active ? colors.bg : colors.text,
                        letterSpacing: 0,
                        lineHeight: 15,
                        includeFontPadding: false,
                      }}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ paddingHorizontal: 24, gap: 10 }}>
              {isLoading ? (
                <>
                  <Skeleton height={84} radius={18} />
                  <Skeleton height={84} radius={18} />
                  <Skeleton height={84} radius={18} />
                </>
              ) : (
                <>
                  {filtered.map((v) => (
                    <DemandRow
                      key={v.id}
                      visit={v}
                      onPress={() => router.push(`/pro/demandes/${v.id}`)}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <View style={{ paddingVertical: 40, alignItems: 'center', gap: 6 }}>
                      <CalendarDays size={22} color={colors.textFaint} strokeWidth={1.75} />
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                        Aucune demande
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        Les demandes de visite apparaîtront ici.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ===================================================================

function DemandRow({ visit, onPress }: { visit: VisitRequest; onPress: () => void }) {
  const { colors } = useTheme();
  const meta = STATUS_META[String(visit.status)] ?? STATUS_META.pending;
  const isPending = visit.status === 'pending';
  const buyerName = visit.buyer?.displayName ?? 'Visiteur';
  const initial = buyerName.charAt(0).toUpperCase();
  const propertyTitle = visit.property?.title ?? 'Bien';

  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 14,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: isPending ? 1.5 : 1,
        borderColor: isPending ? colors.primary : colors.border,
        flexDirection: 'row',
        gap: 12,
      }}
    >
      <View style={{ position: 'relative' }}>
        {visit.buyer?.avatarUrl ? (
          <Image
            source={visit.buyer.avatarUrl}
            style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: colors.bgSunken }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              backgroundColor: colors.bgSunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{initial}</Text>
          </View>
        )}
        {isPending && (
          <View
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 14,
              height: 14,
              borderRadius: 999,
              backgroundColor: colors.primary,
              borderWidth: 2.5,
              borderColor: colors.card,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            style={{
              fontSize: 13.5,
              fontWeight: '700',
              color: colors.text,
              letterSpacing: 0,
              lineHeight: 16,
              includeFontPadding: false,
            }}
            numberOfLines={1}
          >
            {buyerName}
          </Text>
          <View
            style={{
              paddingHorizontal: 7,
              height: 18,
              borderRadius: 999,
              backgroundColor: meta.bg,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 4,
            }}
          >
            <meta.Icon size={9} color={meta.fg} strokeWidth={2.5} />
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: '700',
                color: meta.fg,
                lineHeight: 11,
                includeFontPadding: false,
                letterSpacing: 0.3,
              }}
            >
              {meta.label}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 11, color: colors.textFaint, letterSpacing: 0 }}>
            {formatRelativeFR(visit.createdAt)}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 4,
            letterSpacing: 0,
            lineHeight: 15,
          }}
          numberOfLines={1}
        >
          {propertyTitle}
        </Text>
        {visit.note ? (
          <Text
            style={{
              fontSize: 13,
              color: colors.text,
              marginTop: 4,
              letterSpacing: 0,
              lineHeight: 18,
            }}
            numberOfLines={2}
          >
            {visit.note}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
