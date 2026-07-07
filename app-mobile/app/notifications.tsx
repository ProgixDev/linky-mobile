import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../src/theme/ThemeProvider';
import { Text } from '../src/components/primitives/Text';
import { Chip } from '../src/components/primitives/Chip';
import { TopBar } from '../src/components/nav/TopBar';
import { I, type IconKey } from '../src/icons/Icon';
import { useMarkNotificationsRead } from '../src/data/queries';
import { useNotificationsInfinite } from '../src/data/queries/messages';
import { useAuth } from '../src/stores/auth';
import { Button } from '../src/components/primitives/Button';
import { formatRelativeFR } from '../src/lib/format';
import type { AppNotification } from '../src/data/types';
import { EmptyState, ErrorStateView } from '../src/components/feedback/EmptyState';
import { Skeleton } from '../src/components/primitives/Skeleton';

type Tab = 'all' | 'order' | 'message' | 'visit' | 'promo';

// Filter tabs are role-aware (client 2026-07-07): a seller's alerts aren't an
// agent's or a buyer's. 'order' (product orders) is hidden from a PURE agent;
// 'visit' (property visits) is hidden from a PURE seller. 'all' / 'message' /
// 'promo' are universal. The 'all' tab still shows everything the user
// actually receives, so nothing is ever hidden from view — only the filter
// chips adapt.
const TAB_DEFS: { key: Tab; labelKey: string; show: (r: { buyer: boolean; seller: boolean; agent: boolean }) => boolean }[] = [
  { key: 'all', labelKey: 'notifications.filterAll', show: () => true },
  { key: 'order', labelKey: 'notifications.filterOrder', show: (r) => r.buyer || r.seller },
  { key: 'message', labelKey: 'notifications.filterMessage', show: () => true },
  { key: 'visit', labelKey: 'notifications.filterVisit', show: (r) => r.buyer || r.agent },
  { key: 'promo', labelKey: 'notifications.filterPromo', show: () => true },
];

const ICON_FOR: Record<string, IconKey> = {
  check: 'check',
  msg: 'msg',
  bolt: 'bolt',
  star: 'star',
  heart: 'heart',
  shield: 'shield',
};

export default function NotificationsRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Phase U.5 — infinite pagination. The screen used to cap at the newest
  // 30 (the first page) and discarded the next_cursor.
  const notifQuery = useNotificationsInfinite();
  const items: AppNotification[] = useMemo(() => {
    const pages = notifQuery.data?.pages ?? [];
    return pages.flatMap((p) =>
      p.notifications.map((n) => ({
        id: n.id,
        category: n.category,
        title: n.title,
        body: n.body,
        at: n.created_at,
        read: n.read_at !== null,
        iconHint: n.icon_hint,
        // Pre-fix, the deeplink was fetched then dropped here — every row
        // rendered as a dead View. Rows now navigate like a push tap does.
        deeplink: n.deeplink,
      })),
    );
  }, [notifQuery.data]);
  const markRead = useMarkNotificationsRead();
  const [tab, setTab] = useState<Tab>('all');

  // Role-aware filter chips.
  const roles = useAuth((s) => s.roles);
  const roleFlags = {
    buyer: roles.includes('buyer'),
    seller: roles.includes('seller'),
    agent: roles.includes('agent'),
  };
  const visibleTabs = TAB_DEFS.filter((d) => d.show(roleFlags));
  // If the active tab is hidden for this role, fall back to 'all'.
  useEffect(() => {
    if (!visibleTabs.some((d) => d.key === tab)) setTab('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles]);

  useEffect(() => {
    // Mark all read on view
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items.filter((n) => (tab === 'all' ? true : n.category === tab));

  const grouped: { today: AppNotification[]; week: AppNotification[] } = {
    today: [],
    week: [],
  };
  // "Aujourd'hui" = since local midnight, not a rolling 24h window — a 9am
  // notification should still read as "Aujourd'hui" at 11pm the same day.
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const midnightMs = midnight.getTime();
  for (const n of filtered) {
    if (new Date(n.at).getTime() >= midnightMs) grouped.today.push(n);
    else grouped.week.push(n);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title={t('notifications.title')}
        back
        /* Phase U.0d — the gear lied : /settings is the Language picker,
            no notification-prefs screen exists in V1. Removed rather
            than mislabelled. */
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={notifQuery.isFetching && !notifQuery.isLoading}
            onRefresh={() => void notifQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* Phase U.0 should-fix — exclusive error : grouped sections must
            NOT render alongside the error view, and loading state shows
            real skeleton rows instead of nothing. U.0d — gate on "no
            cached data" so a failed pull-to-refresh keeps the cached
            list visible. */}
        {notifQuery.isError && items.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <ErrorStateView onRetry={() => void notifQuery.refetch()} />
          </View>
        ) : notifQuery.isLoading ? (
          <View style={{ gap: 10, paddingTop: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={64} radius={16} />
            ))}
          </View>
        ) : (
          <>
            {/* Phase U.0d — chips inside the non-error arm. They were
                rendering interactive-but-useless above the error state. */}
            <View style={{ paddingBottom: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {visibleTabs.map((d) => (
                  <Chip
                    key={d.key}
                    label={t(d.labelKey)}
                    active={tab === d.key}
                    onPress={() => setTab(d.key)}
                  />
                ))}
              </ScrollView>
            </View>
            {filtered.length === 0 && (
              <EmptyState
                icon="bell"
                title={items.length === 0 ? t('notifications.emptyTitle') : t('notifications.emptyInFilterTitle')}
                description={
                  items.length === 0
                    ? t('notifications.emptySub')
                    : t('notifications.emptyInFilterSub')
                }
              />
            )}
            {grouped.today.length > 0 && (
              <>
                <Text variant="micro" tone="muted" style={{ marginTop: 6, marginBottom: 8 }}>
                  {t('notifications.today')}
                </Text>
                {grouped.today.map((n) => (
                  <NotificationRow key={n.id} item={n} />
                ))}
              </>
            )}
            {grouped.week.length > 0 && (
              <>
                <Text variant="micro" tone="muted" style={{ marginTop: 16, marginBottom: 8 }}>
                  {t('notifications.thisWeek')}
                </Text>
                {grouped.week.map((n) => (
                  <NotificationRow key={n.id} item={n} />
                ))}
              </>
            )}
            {/* Phase U.5 — pagination via next_cursor. Hidden when there's
                no next page. Loading state ensures the user knows it's
                fetching ; mark-read semantics untouched. */}
            {notifQuery.hasNextPage && (
              <View style={{ paddingTop: 18, alignItems: 'center' }}>
                <Button
                  variant="outline"
                  size="md"
                  label={t('notifications.loadMore')}
                  loading={notifQuery.isFetchingNextPage}
                  disabled={notifQuery.isFetchingNextPage}
                  onPress={() => void notifQuery.fetchNextPage()}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function NotificationRow({ item }: { item: AppNotification }) {
  const { colors } = useTheme();
  const Icon = I[ICON_FOR[item.iconHint] ?? 'info'];
  // NOTE: the theme has no info-soft / success-soft tokens (only primarySoft
  // and accentSoft), so message/visit tints keep a low-alpha rgba() of the
  // theme's info/success hues. Add `infoSoft`/`successSoft` to tokens.ts to
  // make these fully theme-driven.
  const tint =
    item.category === 'order'
      ? { bg: colors.primarySoft, fg: colors.primary }
      : item.category === 'message'
        ? { bg: 'rgba(58,124,168,0.1)', fg: colors.info }
        : item.category === 'visit'
          ? { bg: 'rgba(31,169,113,0.12)', fg: colors.success }
          : item.category === 'promo'
            ? { bg: colors.accentSoft, fg: colors.accentText }
            : { bg: colors.bgSunken, fg: colors.text };
  // Same guard as the push-tap handler (push.ts): only in-app routes.
  const canOpen = typeof item.deeplink === 'string' && item.deeplink.startsWith('/');
  return (
    <Pressable
      disabled={!canOpen}
      onPress={() => {
        if (canOpen) router.push(item.deeplink as never);
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        alignItems: 'flex-start',
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 999,
          backgroundColor: tint.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={17} color={tint.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600' }}>{item.title}</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 2, lineHeight: 16, letterSpacing: 0 }}>
          {item.body}
        </Text>
        <Text variant="micro" tone="faint" style={{ marginTop: 4, letterSpacing: 0, textTransform: 'none' }}>
          {formatRelativeFR(item.at)}
        </Text>
      </View>
      {!item.read && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.primary, marginTop: 6 }} />}
    </Pressable>
  );
}
