import { useLocalSearchParams } from 'expo-router';

import { DeliveryDetailScreen } from '@/features/deliveries';

/**
 * Routes stay THIN — wire the URL param to the feature screen; the detail +
 * QR-handoff flow lives in src/features/deliveries (spec 002).
 * See docs/architecture/module-boundaries.md
 */
export default function DeliveryDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DeliveryDetailScreen id={id} />;
}
