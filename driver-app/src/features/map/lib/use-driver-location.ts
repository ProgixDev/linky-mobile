import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Coord = { lat: number; lng: number };
export type LocationStatus = 'unknown' | 'granted' | 'denied';

/**
 * Foreground driver location: requests permission with a no-dead-end deny path
 * (the screen offers Settings on `denied`), seeds from the last-known fix for an
 * instant first paint, then live-tracks via `watchPosition`. Cleans up on unmount.
 */
export function useDriverLocation() {
  const [status, setStatus] = useState<LocationStatus>('unknown');
  const [coord, setCoord] = useState<Coord | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  const start = useCallback(async () => {
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('denied');
        return;
      }
      setStatus('granted');
      const last = await Location.getLastKnownPositionAsync();
      if (last) setCoord({ lat: last.coords.latitude, lng: last.coords.longitude });
      subRef.current?.remove();
      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 5000 },
        (pos) => setCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      );
    } catch {
      setStatus('denied');
    }
  }, []);

  useEffect(() => {
    void start();
    return () => {
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [start]);

  return { status, coord, retry: start };
}
