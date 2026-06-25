import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { resolveDeepLinkPath, SAFE_FALLBACK_ROUTE } from '@/shared/lib/deep-link';
import { AppText, Button, EmptyState, Screen, Skeleton } from '@/shared/ui';

import { type AppNotification } from '../model/schema';
import { useNotificationsStore } from '../model/store';
import { NotificationRow } from './notification-row';

function LoadingList() {
  return (
    <View className="gap-3 pt-2" testID="notifications-loading">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} className="flex-row gap-3 rounded-card border border-ink-faint/15 p-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <View className="flex-1 gap-2 py-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * The driver's notifications inbox (spec: in-app inbox backed by list-notifications +
 * mark-notifications-read). Loads + marks-all-read on focus; tapping an item follows
 * its (validated) deeplink. Honest states for loading / empty / error.
 */
export function NotificationsScreen() {
  const items = useNotificationsStore((s) => s.items);
  const status = useNotificationsStore((s) => s.status);
  const nextCursor = useNotificationsStore((s) => s.nextCursor);
  const load = useNotificationsStore((s) => s.load);
  const refresh = useNotificationsStore((s) => s.refresh);
  const loadMore = useNotificationsStore((s) => s.loadMore);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  // Captured once so relative times render deterministically within a screen session.
  const [now] = useState(() => Date.now());

  // On focus: fetch the latest, then mark everything read (matches the backend's
  // coarse "mark all read on focus" contract). Re-runs when returning from a detail.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        await load();
        if (!cancelled) void markAllRead();
      })();
      return () => {
        cancelled = true;
      };
    }, [load, markAllRead]),
  );

  const onPressItem = useCallback((n: AppNotification) => {
    if (!n.deeplink) return;
    const safe = resolveDeepLinkPath(n.deeplink);
    if (safe !== SAFE_FALLBACK_ROUTE) router.push(safe as Href);
  }, []);

  const showInitialLoading = status === 'loading' && items.length === 0;
  const showError = status === 'error' && items.length === 0;

  return (
    <Screen testID="notifications-screen">
      <View className="gap-1 pb-4 pt-4">
        <AppText variant="display">Notifications</AppText>
      </View>

      {showInitialLoading ? (
        <LoadingList />
      ) : showError ? (
        <EmptyState
          testID="notifications-error"
          title="Impossible de charger tes notifications"
          description="Vérifie ta connexion et réessaie."
          action={
            <Button testID="notifications-retry" label="Réessayer" onPress={() => void load()} />
          }
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => (
            <NotificationRow notification={item} now={now} onPress={onPressItem} />
          )}
          ItemSeparatorComponent={() => <View className="h-3" />}
          refreshControl={
            <RefreshControl refreshing={status === 'refreshing'} onRefresh={() => void refresh()} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (nextCursor) void loadMore();
          }}
          ListEmptyComponent={
            <EmptyState
              testID="notifications-empty"
              title="Aucune notification"
              description="Tes nouvelles livraisons et alertes apparaîtront ici."
            />
          }
          contentContainerClassName="grow pb-8"
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
