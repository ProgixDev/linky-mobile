// Phase X.1 — buyer-side visit list. Pre-X1 this rendered a hardcoded
// "Aucune demande pour le moment" empty state regardless of the user's real
// visits ; the backend endpoint didn't exist yet. Now :
//   - useMyVisitRequests hits /list-my-visit-requests (server returns the
//     caller's visit rows + property snapshot joined for the list card).
//   - Status grouped : En attente → Confirmées → Refusées → Annulées →
//     Terminées. Each group only renders when it has rows ; truly empty
//     state still shows the original CalendarDays empty card.
//   - U.0d state pattern : error only when isError && !data ; loading shows
//     skeletons ; RefreshControl uses the (isFetching && !isLoading)
//     non-polling shape (this query has no refetchInterval, so the spinner
//     can't self-fire).
//   - READ-ONLY for V1 : tapping a card routes to the property detail. No
//     buyer-cancel action ; the 'cancelled' group renders only if such
//     rows already exist (e.g. agent-cancelled or future server cancel).
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { CalendarDays, Check, Clock, MapPin, X as XIcon } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { ErrorStateView } from '../../src/components/feedback/EmptyState';
import { Skeleton } from '../../src/components/primitives/Skeleton';
import { useMyVisitRequests, type BuyerVisitRequest } from '../../src/data/queries/properties';
import { formatGNF } from '../../src/lib/format';
import { useTranslation } from 'react-i18next';

type GroupKey = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';

const GROUP_ORDER: GroupKey[] = ['pending', 'accepted', 'rejected', 'cancelled', 'completed'];

// Phase I.8 — labelKey only. Component resolves with t() at render so the
// group headers flip on language switch.
const GROUP_LABEL_KEY: Record<GroupKey, string> = {
  pending:   'buyer.group.pending',
  accepted:  'buyer.group.accepted',
  rejected:  'buyer.group.rejected',
  cancelled: 'buyer.group.cancelled',
  completed: 'buyer.group.completed',
};

function formatSlot(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

export default function BuyerRequestsRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const q = useMyVisitRequests();
  const data = q.data;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await q.refetch(); }
    finally { setRefreshing(false); }
  }, [q]);

  const grouped = useMemo(() => {
    const out: Record<GroupKey, BuyerVisitRequest[]> = {
      pending: [], accepted: [], rejected: [], cancelled: [], completed: [],
    };
    for (const v of data ?? []) {
      const key = (GROUP_ORDER as string[]).includes(v.status) ? (v.status as GroupKey) : 'pending';
      out[key].push(v);
    }
    return out;
  }, [data]);

  const totalCount = data?.length ?? 0;

  // U.0d state pattern : error replaces the list only when there's nothing
  // cached. A failed background refetch keeps the cached list visible.
  if (q.isError && (!data || data.length === 0)) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('buyer.requestsTitle')} subtitle={t('buyer.requestsSubtitle')} />
        <View style={{ flex: 1 }}>
          <ErrorStateView onRetry={() => void q.refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <ScreenHeader title={t('buyer.requestsTitle')} subtitle={t('buyer.requestsSubtitle')} />

        {q.isLoading ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
            <Skeleton height={92} radius={18} />
            <Skeleton height={92} radius={18} />
            <Skeleton height={92} radius={18} />
          </View>
        ) : totalCount === 0 ? (
          <View
            style={{
              flex: 1,
              paddingHorizontal: 24,
              paddingTop: 60,
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                backgroundColor: colors.bgSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CalendarDays size={24} color={colors.textMuted} strokeWidth={1.75} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
              {t('buyer.requestsEmptyTitle')}
            </Text>
            <Text
              style={{
                fontSize: 12.5,
                color: colors.textMuted,
                textAlign: 'center',
                maxWidth: 280,
                lineHeight: 18,
              }}
            >
              {t('buyer.requestsEmpty')}
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
            {GROUP_ORDER.map((key) => {
              const rows = grouped[key];
              if (rows.length === 0) return null;
              return (
                <View key={key} style={{ marginBottom: 18 }}>
                  <Text
                    variant="micro"
                    tone="muted"
                    style={{ marginTop: 4, marginBottom: 8 }}
                  >
                    {t(GROUP_LABEL_KEY[key]).toUpperCase()} · {rows.length}
                  </Text>
                  <View style={{ gap: 10 }}>
                    {rows.map((v) => (
                      <VisitRow key={v.id} visit={v} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VisitRow({ visit }: { visit: BuyerVisitRequest }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const metaBase = STATUS_META[visit.status] ?? STATUS_META.pending;
  const meta = { ...metaBase, label: t(metaBase.labelKey) };
  return (
    <Pressable
      onPress={() => router.push(`/property/${visit.propertyId}`)}
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
      {visit.property?.coverUrl ? (
        <Image
          source={visit.property.coverUrl}
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            backgroundColor: colors.bgSunken,
          }}
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            backgroundColor: colors.bgSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CalendarDays size={22} color={colors.textMuted} />
        </View>
      )}

      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            fontSize: 13.5,
            fontWeight: '700',
            color: colors.text,
            lineHeight: 17,
            includeFontPadding: false,
          }}
          numberOfLines={1}
        >
          {visit.property?.title ?? t('buyer.propertyRemoved')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Clock size={11} color={colors.textMuted} strokeWidth={2} />
          <Text
            style={{
              fontSize: 12,
              color: colors.textMuted,
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatSlot(visit.requestedAt)}
          </Text>
        </View>
        {visit.property ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MapPin size={11} color={colors.textMuted} strokeWidth={2} />
            <Text style={{ fontSize: 11.5, color: colors.textMuted }} numberOfLines={1}>
              {[visit.property.district, visit.property.city]
                .filter(Boolean)
                .join(', ') || visit.property.city}
              {' · '}
              <Text style={{ fontWeight: '700', color: colors.text }}>
                {formatGNF(visit.property.priceGnf)}
                {visit.property.perMonth ? ' /mois' : ''}
              </Text>
            </Text>
          </View>
        ) : null}
      </View>

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
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: '700',
            color: meta.fg(colors),
            letterSpacing: 0.3,
            lineHeight: 12,
            includeFontPadding: false,
          }}
        >
          {meta.label}
        </Text>
      </View>
    </Pressable>
  );
}

// Phase I.8 — labelKey only ; VisitRow resolves via t() at render.
const STATUS_META: Record<
  string,
  {
    labelKey: string;
    Icon: typeof Check | null;
    bg: (c: ReturnType<typeof useTheme>['colors']) => string;
    fg: (c: ReturnType<typeof useTheme>['colors']) => string;
  }
> = {
  pending: {
    labelKey: 'buyer.status.pending',
    Icon: Clock,
    bg: (c) => c.accentSoft,
    fg: (c) => c.accentText,
  },
  accepted: {
    labelKey: 'buyer.status.accepted',
    Icon: Check,
    bg: (c) => c.primarySoft,
    fg: (c) => c.primaryDeep,
  },
  rejected: {
    labelKey: 'buyer.status.rejected',
    Icon: XIcon,
    bg: () => 'rgba(209,79,60,0.12)',
    fg: (c) => c.danger,
  },
  cancelled: {
    labelKey: 'buyer.status.cancelled',
    Icon: XIcon,
    bg: (c) => c.bgSunken,
    fg: (c) => c.textMuted,
  },
  completed: {
    labelKey: 'buyer.status.completed',
    Icon: Check,
    bg: (c) => c.primarySoft,
    fg: (c) => c.primaryDeep,
  },
};
