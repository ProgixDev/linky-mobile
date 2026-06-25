import { apiPost } from '@/shared/lib/api';

import {
  MarkReadResponseSchema,
  NotificationListResponseSchema,
  mapNotification,
  type AppNotification,
  type NotificationCursor,
} from '../model/schema';

export type NotificationsPage = {
  items: AppNotification[];
  nextCursor: NotificationCursor | null;
  unreadCount: number;
};

/**
 * Fetch one page of the caller's notifications (newest first). The request
 * carries no identity — `apiPost` attaches the Linky access token and the
 * function derives the user from it. Keyset pagination via `cursor`; the inbox
 * loads the first page and appends on scroll.
 */
export async function fetchNotifications(cursor?: NotificationCursor): Promise<NotificationsPage> {
  const data = await apiPost<unknown>({
    path: '/list-notifications',
    body: cursor ? { cursor } : {},
  });
  const parsed = NotificationListResponseSchema.safeParse(data);
  if (!parsed.success) throw new Error('Unexpected notifications response');
  return {
    items: parsed.data.notifications.map(mapNotification),
    nextCursor: parsed.data.next_cursor ?? null,
    unreadCount: parsed.data.unread_count,
  };
}

/** Mark ALL of the caller's unread notifications as read. Returns how many flipped. */
export async function markNotificationsRead(): Promise<number> {
  const data = await apiPost<unknown>({ path: '/mark-notifications-read', body: {} });
  const parsed = MarkReadResponseSchema.safeParse(data);
  return parsed.success ? parsed.data.marked_count : 0;
}
