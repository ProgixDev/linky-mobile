import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../src/theme/ThemeProvider';
import { Text } from '../src/components/primitives/Text';
import { Chip } from '../src/components/primitives/Chip';
import { TopBar } from '../src/components/nav/TopBar';
import { IconButton } from '../src/components/primitives/Button';
import { I, type IconKey } from '../src/icons/Icon';
import { useNotifications, useMarkNotificationsRead } from '../src/data/queries';
import { formatRelativeFR } from '../src/lib/format';
import type { AppNotification } from '../src/data/types';
import { EmptyState, ErrorStateView } from '../src/components/feedback/EmptyState';
import { Skeleton } from '../src/components/primitives/Skeleton';

type Tab = 'all' | 'order' | 'message' | 'visit' | 'promo';

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
  const notifQuery = useNotifications();
  const items = notifQuery.data;
  const markRead = useMarkNotificationsRead();
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    // Mark all read on view
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items?.filter((n) => (tab === 'all' ? true : n.category === tab)) ?? [];

  const grouped: { today: AppNotification[]; week: AppNotification[] } = {
    today: [],
    week: [],
  };
  for (const n of filtered) {
    const ms = Date.now() - new Date(n.at).getTime();
    if (ms < 24 * 3600_000) grouped.today.push(n);
    else grouped.week.push(n);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title="Notifications"
        back
        right={
          // Phase U.0 should-fix — was IconButton with no onPress ; wired to /settings.
          <IconButton
            variant="secondary"
            size={36}
            onPress={() => router.push('/settings')}
            accessibilityLabel="Préférences de notifications"
          >
            <I.settings size={16} color={colors.text} />
          </IconButton>
        }
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label="Toutes" active={tab === 'all'} onPress={() => setTab('all')} />
          <Chip label="Commandes" active={tab === 'order'} onPress={() => setTab('order')} />
          <Chip label="Messages" active={tab === 'message'} onPress={() => setTab('message')} />
          <Chip label="Visites" active={tab === 'visit'} onPress={() => setTab('visit')} />
          <Chip label="Promos" active={tab === 'promo'} onPress={() => setTab('promo')} />
        </ScrollView>
      </View>

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
            real skeleton rows instead of nothing. */}
        {notifQuery.isError ? (
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
            {filtered.length === 0 && (
              <EmptyState
                icon="bell"
                title={items && items.length === 0 ? 'Pas de notifications' : 'Rien dans ce filtre'}
                description={
                  items && items.length === 0
                    ? 'Tes alertes (commandes, messages, visites) apparaîtront ici.'
                    : 'Bascule sur Toutes pour voir tes autres notifications.'
                }
              />
            )}
            {grouped.today.length > 0 && (
              <>
                <Text variant="micro" tone="muted" style={{ marginTop: 6, marginBottom: 8 }}>
                  AUJOURD'HUI
                </Text>
                {grouped.today.map((n) => (
                  <NotificationRow key={n.id} item={n} />
                ))}
              </>
            )}
            {grouped.week.length > 0 && (
              <>
                <Text variant="micro" tone="muted" style={{ marginTop: 16, marginBottom: 8 }}>
                  CETTE SEMAINE
                </Text>
                {grouped.week.map((n) => (
                  <NotificationRow key={n.id} item={n} />
                ))}
              </>
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
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        alignItems: 'flex-start',
      }}
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
    </View>
  );
}
