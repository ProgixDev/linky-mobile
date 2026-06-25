import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/shared/ui';

import { type AppNotification } from '../model/schema';

// Backend icon_hint keys (see _shared/push.ts) → a glyph. Falls back to a neutral dot.
const ICON_FOR: Record<string, string> = {
  check: '✅',
  msg: '💬',
  bolt: '⚡',
  star: '⭐',
  heart: '❤️',
  shield: '🛡️',
  info: '🔔',
};

/** Compact French relative time. Coarse on purpose — this is a glanceable inbox. */
function relativeTime(epochMs: number, now: number): string {
  const diff = Math.max(0, now - epochMs);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'hier';
  if (d < 7) return `il y a ${d} j`;
  return new Date(epochMs).toLocaleDateString('fr-FR');
}

export type NotificationRowProps = {
  notification: AppNotification;
  /** `now` is injected so the list renders deterministically (and is testable). */
  now: number;
  onPress: (n: AppNotification) => void;
};

function NotificationRowComponent({ notification, now, onPress }: NotificationRowProps) {
  const { read } = notification;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(notification)}
      testID={`notification-row-${notification.id}`}
      className="flex-row gap-3 rounded-card border border-ink-faint/15 bg-surface p-4 active:bg-surface-muted"
    >
      <AppText variant="title" className="text-xl">
        {ICON_FOR[notification.iconHint] ?? ICON_FOR.info}
      </AppText>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <AppText
            variant="label"
            numberOfLines={1}
            className={read ? 'flex-1 text-ink-muted' : 'flex-1'}
          >
            {notification.title}
          </AppText>
          {read ? null : (
            <View className="h-2 w-2 rounded-full bg-brand-600" testID="notification-unread-dot" />
          )}
        </View>
        <AppText variant="caption" numberOfLines={2}>
          {notification.body}
        </AppText>
        <AppText variant="caption" className="text-ink-faint">
          {relativeTime(notification.createdAt, now)}
        </AppText>
      </View>
    </Pressable>
  );
}

export const NotificationRow = memo(NotificationRowComponent);
export { relativeTime };
