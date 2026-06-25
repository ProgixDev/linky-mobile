/**
 * PUBLIC API of the notifications feature. Keep it minimal.
 *
 * The device push-token plumbing (register / unregister / channel) lives in
 * `@/shared/lib/push` so the auth feature can unregister on sign-out — only the
 * inbox UI, the nav bell, and the in-app observers belong to this feature.
 */
export { NotificationsScreen } from './ui/notifications-screen';
export { NotificationBell } from './ui/notification-bell';
export { useNotificationObservers } from './model/use-notification-observers';
export { useNotificationsStore } from './model/store';
export type { AppNotification } from './model/schema';
