import { View } from 'react-native';

import { AppText, Screen } from '@/shared/ui';

import { type Coord } from '../model/route';
import { useNavigation } from '../use-navigation';

function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtEta(seconds: number): string {
  const min = Math.round(seconds / 60);
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder — shows
 * the live turn-by-turn instruction + ETA as text. Add react-native-maps and draw
 * `route.geometry` for the real map.
 */
export function NavScreen({ destination }: { destination: Coord }) {
  const { route, progress, error } = useNavigation(destination);

  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        {error ? (
          <AppText variant="body" className="text-danger">
            {error}
          </AppText>
        ) : null}
        {!route ? <AppText variant="body">Finding route…</AppText> : null}
        {progress?.arrived ? (
          <AppText variant="display">You’ve arrived ✓</AppText>
        ) : progress?.currentStep ? (
          <>
            <AppText variant="display">{progress.currentStep.instruction}</AppText>
            <AppText variant="title">in {fmtDistance(progress.distanceToNext)}</AppText>
          </>
        ) : null}
        {route ? (
          <AppText variant="caption">
            {fmtDistance(progress?.remainingDistance ?? route.distance)} · ~{fmtEta(route.duration)}{' '}
            · {route.steps.length} steps
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}
