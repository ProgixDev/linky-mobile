import { useLocalSearchParams } from 'expo-router';

import { RouteMapScreen } from '@/features/deliveries';

/**
 * Routes stay THIN — wire the URL param to the feature screen. The in-app route
 * map (boutique → client + live GPS) lives in src/features/deliveries.
 * See docs/architecture/module-boundaries.md
 */
export default function ItineraireRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RouteMapScreen id={id} />;
}
