import { supabase } from '@/shared/lib/supabase';

import { MapMarkerSchema, type Coord, type MapMarker } from './model/marker';

/** Great-circle distance in km (haversine). */
export function distanceKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type NearbyOptions = {
  table: string;
  center: Coord;
  radiusKm?: number;
  /** Column names if your table doesn't use lat/lng/id/title. */
  columns?: { id?: string; title?: string; lat?: string; lng?: string };
  limit?: number;
};

/**
 * Fetch rows from a table near a point — NO PostGIS required. We pre-filter with
 * a cheap lat/lng bounding box in SQL (uses a normal index), then refine and sort
 * by exact haversine distance on the client. Good to a few thousand rows; for
 * planet-scale, switch to PostGIS + an RPC behind the same MapMarker shape.
 */
export async function fetchNearby(options: NearbyOptions): Promise<MapMarker[]> {
  const { table, center, radiusKm = 10, limit = 100 } = options;
  const cols = { id: 'id', title: 'title', lat: 'lat', lng: 'lng', ...options.columns };

  // 1 degree latitude ~= 111km; longitude shrinks by cos(latitude).
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));

  const { data, error } = await supabase
    .from(table)
    .select(`${cols.id}, ${cols.title}, ${cols.lat}, ${cols.lng}`)
    .gte(cols.lat, center.lat - dLat)
    .lte(cols.lat, center.lat + dLat)
    .gte(cols.lng, center.lng - dLng)
    .lte(cols.lng, center.lng + dLng)
    .limit(limit * 2);
  if (error || !data) return [];

  return (data as Record<string, unknown>[])
    .map((row) =>
      MapMarkerSchema.safeParse({
        id: String(row[cols.id]),
        title: String(row[cols.title] ?? ''),
        lat: Number(row[cols.lat]),
        lng: Number(row[cols.lng]),
      }),
    )
    .flatMap((r) => (r.success ? [r.data] : []))
    .filter((m) => distanceKm(center, m) <= radiusKm)
    .sort((a, b) => distanceKm(center, a) - distanceKm(center, b))
    .slice(0, limit);
}
