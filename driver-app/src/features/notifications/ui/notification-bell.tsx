import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/shared/ui';

import { useNotificationsStore } from '../model/store';

// Typed-routes generates the Href union from the filesystem; cast the literal so a
// cold `tsc` (before .expo/types regenerates) still type-checks.
const NOTIFICATIONS = '/notifications' as Href;

/**
 * The notifications entry point: a bell with an unread badge, for the deliveries
 * header. Reads `unreadCount` from the store (kept fresh by useNotificationObservers
 * in the root layout). Tapping opens the inbox.
 */
export function NotificationBell() {
  const unread = useNotificationsStore((s) => s.unreadCount);
  const label = unread > 99 ? '99+' : String(unread);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} non lues` : 'Notifications'}
      onPress={() => router.push(NOTIFICATIONS)}
      hitSlop={8}
      testID="notifications-bell"
      className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-muted"
    >
      <AppText variant="title" className="text-xl">
        🔔
      </AppText>
      {unread > 0 ? (
        <View
          testID="notifications-bell-badge"
          className="absolute right-0 top-0 h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1"
        >
          <AppText className="font-sans-bold text-[10px] text-ink-inverse">{label}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
