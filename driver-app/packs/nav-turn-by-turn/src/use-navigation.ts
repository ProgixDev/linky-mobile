import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { getRoute } from './data/osrm';
import { type Coord, type Route } from './model/route';
import { computeProgress, type NavProgress } from './nav-engine';

/**
 * Live navigation: watches the device location, fetches a route to the
 * destination, and recomputes the turn-by-turn progress as you move. The UI
 * renders `progress.currentStep.instruction` + `distanceToNext` (and a map, if
 * you add react-native-maps, from `route.geometry`).
 */
export function useNavigation(destination: Coord | null) {
  const [position, setPosition] = useState<Coord | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [progress, setProgress] = useState<NavProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Watch position.
  useEffect(() => {
    let active = true;
    let sub: Location.LocationSubscription | null = null;
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied.');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => {
          if (active) setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        },
      );
    })();
    return () => {
      active = false;
      sub?.remove();
    };
  }, []);

  // New destination → drop the old route so it refetches.
  useEffect(() => {
    setRoute(null);
  }, [destination?.lat, destination?.lng]);

  // Fetch the route once we have a position + destination and no route yet.
  useEffect(() => {
    if (!position || !destination || route) return;
    let active = true;
    void getRoute(position, destination).then((r) => {
      if (!active) return;
      if (r) setRoute(r);
      else setError('Could not find a route.');
    });
    return () => {
      active = false;
    };
  }, [position, destination, route]);

  // Recompute progress as the position changes.
  useEffect(() => {
    if (position && route) setProgress(computeProgress(position, route));
  }, [position, route]);

  return { position, route, progress, error };
}
