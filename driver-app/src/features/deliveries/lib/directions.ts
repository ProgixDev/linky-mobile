import { type LatLng } from '../model/schema';

/** A road-following driving route from the Mapbox Directions API. */
export type DrivingRoute = {
  /** [lng, lat] pairs that follow the streets — feeds the Mapbox LineLayer directly. */
  coordinates: [number, number][];
  /** Real driving time, in seconds. */
  durationSec: number;
  /** Real driving distance, in metres. */
  distanceM: number;
};

/**
 * Fetch the road-following DRIVING route `from → to` via the Mapbox Directions API
 * (https://api.mapbox.com/directions/v5/mapbox/driving). Uses the same PUBLIC token as
 * the map tiles; the Directions free tier covers launch volume. Best-effort: returns
 * `null` on a missing token, network failure, non-200, or no route — the caller then
 * falls back to the straight line + haversine estimate. Never throws.
 */
export async function fetchDrivingRoute(
  from: LatLng,
  to: LatLng,
  token: string,
): Promise<DrivingRoute | null> {
  if (!token) return null;
  try {
    const pair = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${pair}` +
      `?geometries=geojson&overview=full&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      routes?: {
        geometry?: { coordinates?: [number, number][] };
        duration?: number;
        distance?: number;
      }[];
    };
    const route = json.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (!route || !Array.isArray(coordinates) || coordinates.length < 2) return null;
    return {
      coordinates,
      durationSec: typeof route.duration === 'number' ? route.duration : 0,
      distanceM: typeof route.distance === 'number' ? route.distance : 0,
    };
  } catch {
    return null;
  }
}
