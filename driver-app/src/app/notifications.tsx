import { NotificationsScreen } from '@/features/notifications';

/**
 * Routes stay THIN — wire the URL to the feature screen; the inbox logic lives in
 * src/features/notifications. See docs/architecture/module-boundaries.md
 */
export default function NotificationsRoute() {
  return <NotificationsScreen />;
}
