import { logger } from '@/shared/lib/logger';

import { type Place } from '../model/place';

const BASE = 'https://nominatim.openstreetmap.org';
// Nominatim asks every client to identify itself. Swap for your app's name on ship.
const HEADERS = { 'User-Agent': 'expo-skeleton-places-pack/1.0 (dev)', Accept: 'application/json' };

type RawPlace = { place_id: number; display_name: string; lat: string; lon: string };

/** Forward search: free-text query -> ranked places. Never throws; [] on failure. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const url = `${BASE}/search?format=json&limit=8&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: HEADERS, signal });
    if (!res.ok) return [];
    const rows = (await res.json()) as RawPlace[];
    return rows.map((r) => ({
      id: String(r.place_id),
      label: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return [];
    logger.warn('places: search failed', { err });
    return [];
  }
}

/** Reverse geocode: coordinates -> a place label. Returns null on failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<Place | null> {
  try {
    const url = `${BASE}/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const r = (await res.json()) as RawPlace & { error?: string };
    if (r.error || !r.display_name) return null;
    return { id: String(r.place_id), label: r.display_name, lat, lng };
  } catch (err) {
    logger.warn('places: reverse failed', { err });
    return null;
  }
}
