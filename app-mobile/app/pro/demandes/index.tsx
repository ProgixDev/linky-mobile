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
import { useTranslation } from 'react-i18next';

type Filter = 'all' | 'pending' | 'accepted' | 'rejected';

// Phase I.8 — labelKey only. Component useMemo(t) at render.
const FILTER_DEFS: { id: Filter; labelKey: string; statuses?: VisitStatus[] }[] = [
  { id: 'all', labelKey: 'pro.filterAllShort' },
  { id: 'pending', labelKey: 'pro.filterToAnswer', statuses: ['pending'] },
  { id: 'accepted', labelKey: 'pro.filterAccepted', statuses: ['accepted'] },
  { id: 'rejected', labelKey: 'pro.filterDeclined', statuses: ['rejected', 'cancelled'] },
];

// Status tones map to theme tokens (resolved per-render) so the pills stay
// legible on dark `colors.card` — mirrors the pattern in pro/visites/index.tsx.
type PillTone = 'accent' | 'primary' | 'danger' | 'muted';

const STATUS_META: Record<
  string,
  { labelKey: string; Icon: LucideIcon; tone: PillTone }
> = {
  pending: { labelKey: 'pro.status.pending', Icon: Clock, tone: 'accent' },
  accepted: { labelKey: 'pro.status.accepted', Icon: CheckCircle2, tone: 'primary' },
  rejected: { labelKey: 'pro.status.declined', Icon: X, tone: 'danger' },
  cancelled: { labelKey: 'pro.status.cancelled', Icon: X, tone: 'muted' },
  completed: { labelKey: 'pro.status.completed', Icon: CheckCircle2, tone: 'primary' },
};

export default function DemandesIndex() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const visitsQuery = useAgentVisits();
  const visits = visitsQuery.data;
  const isLoading = visitsQuery.isLoading;
  const FILTERS = useMemo(
    () => FILTER_DEFS.map((f) => ({ ...f, label: t(f.labelKey) })),
    [t],
  );

  const filtered = useMemo(() => {
    const list = visits ?? [];
    const f = FILTERS.find((x) => x.id === filter);
    if (!f?.statuses) return list;
    return list.filter((v) => f.statuses!.includes(v.status as VisitStatus));
  }, [visits, filter, FILTERS]);

  const unreadCount = (visits ?? []).filter((v) => v.status === 'pending').length;
  // U.0d — subtitle error arm gated on "no cached data" so a failed
  // pull-to-refresh keeps the unread count visible.
  const subtitle = visitsQuery.isError && (!visits || visits.length === 0)
    ? t('pro.demandesSubError')
    : isLoading
      ? t('pro.demandesSubLoading')
      : unreadCount > 0
        ? t('pro.demandesSubPending', { count: unreadCount })
        : t('pro.demandesSubNoPending');

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
        <ScreenHeader title={t('pro.demandesTitle')} subtitle={subtitle} />

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
                        {t('pro.demandesEmptyTitle')}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {t('pro.demandesEmptyBody')}
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
  const { t } = useTranslation();
  const metaBase = STATUS_META[String(visit.status)] ?? STATUS_META.pending;
  const meta = { ...metaBase, label: t(metaBase.labelKey) };
  const pillBg =
    meta.tone === 'accent'
      ? colors.accentSoft
      : meta.tone === 'primary'
        ? colors.primarySoft
        : meta.tone === 'danger'
          ? 'rgba(209,79,60,0.12)'
          : colors.bgSunken;
  const pillFg =
    meta.tone === 'accent'
      ? colors.accentText
      : meta.tone === 'primary'
        ? colors.primaryDeep
        : meta.tone === 'danger'
          ? colors.danger
          : colors.textMuted;
  const isPending = visit.status === 'pending';
  const buyerName = visit.buyer?.displayName ?? t('pro.demandesFallbackVisitor');
  const initial = buyerName.charAt(0).toUpperCase();
  const propertyTitle = visit.property?.title ?? t('pro.demandesFallbackProperty');

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
              backgroundColor: pillBg,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 4,
            }}
          >
            <meta.Icon size={9} color={pillFg} strokeWidth={2.5} />
            <Text
              style={{
                fontSize: 9.5,
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
