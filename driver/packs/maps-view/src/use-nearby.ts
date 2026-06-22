import { useEffect, useState } from 'react';

import { fetchNearby } from './nearby';
import { type Coord, type MapMarker } from './model/marker';

/**
 * Loads markers from `table` near `center`. Re-queries when the center or radius
 * changes (e.g. as the user pans the map). Errors resolve to an empty list.
 */
export function useNearby(table: string, center: Coord | null, radiusKm = 10) {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const found = await fetchNearby({ table, center, radiusKm });
      if (!cancelled) {
        setMarkers(found);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [table, center?.lat, center?.lng, radiusKm]);

  return { markers, loading };
}
