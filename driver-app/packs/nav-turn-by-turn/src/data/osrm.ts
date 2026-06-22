import { type Coord, type Route, type RouteStep } from '../model/route';

/**
 * Routing via OSRM — a free, **key-free** routing engine. The public demo server
 * (router.project-osrm.org) is rate-limited and for dev/testing only; for
 * production, self-host OSRM or swap this file for Mapbox/Google Directions.
 */
const BASE = 'https://router.project-osrm.org/route/v1';

type Profile = 'driving' | 'walking' | 'cycling';

/** Turn an OSRM maneuver into a short human instruction. */
function instructionOf(step: {
  maneuver: { type: string; modifier?: string };
  name?: string;
}): string {
  const { type, modifier } = step.maneuver;
  const road = step.name ? ` onto ${step.name}` : '';
  if (type === 'depart') return 'Head out' + road;
  if (type === 'arrive') return 'Arrive at your destination';
  if (type === 'roundabout' || type === 'rotary') return 'Take the roundabout' + road;
  if (type === 'continue' || type === 'new name') return 'Continue' + road;
  const dir = modifier ? ` ${modifier}` : '';
  if (type === 'turn') return `Turn${dir}${road}`;
  if (type === 'merge') return `Merge${dir}${road}`;
  if (type === 'fork') return `Keep${dir}${road}`;
  return `${type}${dir}${road}`.trim();
}

/** Get a route between two points. Never throws — returns null on failure. */
export async function getRoute(
  from: Coord,
  to: Coord,
  profile: Profile = 'driving',
): Promise<Route | null> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${BASE}/${profile}/${coords}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs: Array<{
          steps: Array<{
            maneuver: { type: string; modifier?: string; location: [number, number] };
            name?: string;
            distance: number;
          }>;
        }>;
      }>;
    };
    const route = json.routes?.[0];
    if (json.code !== 'Ok' || !route) return null;

    const steps: RouteStep[] = (route.legs[0]?.steps ?? []).map((s) => ({
      instruction: instructionOf(s),
      location: { lng: s.maneuver.location[0], lat: s.maneuver.location[1] },
      distance: s.distance,
    }));

    return {
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      steps,
    };
  } catch {
    return null;
  }
}
