import { useMemo } from 'react';

import { useDeliveriesStore } from '@/features/deliveries';
import { MapScreen, type MapDelivery } from '@/features/map';

/**
 * Carte (center tab) — the live map. Routes stay THIN: read the active deliveries
 * from the store and hand the map the minimal shape it needs (keeps the map
 * feature free of a cross-feature import).
 */
export default function CarteRoute() {
  const items = useDeliveriesStore((s) => s.items);
  const deliveries = useMemo<MapDelivery[]>(
    () =>
      items
        .filter((d) => d.status === 'assigned' || d.status === 'in_transit')
        .map((d) => ({
          id: d.id,
          orderRef: d.orderRef,
          area: [d.dropoffCity, d.dropoffDistrict].filter(Boolean).join(' · '),
          createdAt: d.createdAt,
        })),
    [items],
  );

  return <MapScreen deliveries={deliveries} />;
}
