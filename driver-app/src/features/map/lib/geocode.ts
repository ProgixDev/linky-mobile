import { env } from '@/shared/lib/env';

import type { Coord } from './use-driver-location';

/** Conakry centroid — the map's default focus + geocode fallback. */
export const CONAKRY: Coord = { lat: 9.6412, lng: -13.5784 };

/**
 * Geocode a dropoff AREA (city · district) to a coordinate via the Mapbox
 * Geocoding API. This is the FALLBACK for client pins until the backend returns
 * exact lat/lng on the delivery (ADR-0010 / backend ask #1): the list exposes
 * only the area (never the street, spec 001 AC-10), so pins are approximate.
 * Returns null on any failure so callers can skip the pin gracefully.
 */
export async function geocodeArea(query: string): Promise<Coord | null> {
  const token = env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const q = query.trim();
  if (!token || !q) return null;
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${q}, Guinée`)}.json` +
      `?limit=1&language=fr&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: { center?: [number, number] }[] };
    const center = json.features?.[0]?.center;
    if (!center || center.length !== 2) return null;
    return { lat: center[1], lng: center[0] };
  } catch {
    return null;
  }
}
