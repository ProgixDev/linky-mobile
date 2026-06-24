import { EmptyState, Screen } from '@/shared/ui';

/**
 * Carte (center tab) — the live map of the courier's position + assigned clients.
 * PLACEHOLDER: the real-time Mapbox map (driver position, client pins, route, the
 * scan-handoff bottom sheet) lands in exec-plan slice 6 (needs the native deps:
 * expo-location + @rnmapbox/maps). Kept as a calm branded state until then.
 */
export function MapScreen() {
  return (
    <Screen testID="map-screen">
      <EmptyState
        testID="map-placeholder"
        title="Carte en préparation"
        description="La carte temps réel de tes livraisons et de tes clients arrive très bientôt."
      />
    </Screen>
  );
}
