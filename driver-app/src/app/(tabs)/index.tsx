import { DeliveriesScreen } from '@/features/deliveries';
import { NotificationBell } from '@/features/notifications';

/**
 * Accueil (left tab) = the courier's deliveries worklist. Routes stay THIN. The
 * notifications bell is injected here (the app layer may compose features; deliveries
 * must not import notifications directly — module boundaries).
 */
export default function AccueilRoute() {
  return <DeliveriesScreen headerRight={<NotificationBell />} />;
}
