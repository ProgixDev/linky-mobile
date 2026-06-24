import Mapbox from '@rnmapbox/maps';
import { router } from 'expo-router';
import { Crosshair, QrCode, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/shared/lib/cn';
import { env } from '@/shared/lib/env';
import { colors } from '@/shared/theme/colors';
import { AppText, Button, EmptyState, Screen } from '@/shared/ui';

import { CONAKRY, geocodeArea } from '../lib/geocode';
import type { Coord } from '../lib/use-driver-location';
import { useDriverLocation } from '../lib/use-driver-location';

const HAS_TOKEN = !!env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (HAS_TOKEN) Mapbox.setAccessToken(env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN);

/** What the map needs per delivery — passed in from the route (no cross-feature import). */
export type MapDelivery = { id: string; orderRef: string; area: string; createdAt: number };

const SLA_MS = 24 * 60 * 60 * 1000;

function remainingLabel(createdAt: number): string {
  const ms = createdAt + SLA_MS - Date.now();
  if (ms <= 0) return 'En retard';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h >= 1 ? `${h}h ${m.toString().padStart(2, '0')}m restantes` : `${m}m restantes`;
}

/**
 * Carte — the live delivery map (ADR-0010). Shows the driver's own foreground
 * position (expo-location watch), a pin per assigned client (geocoded from the
 * dropoff area until the backend returns exact lat/lng), a route line to the
 * selected client, and a bottom sheet (countdown + « Scanner la livraison » →
 * the existing handoff flow). Recenter button + honest token/permission states.
 */
export function MapScreen({ deliveries }: { deliveries: MapDelivery[] }) {
  const insets = useSafeAreaInsets();
  const { status, coord: driver, retry } = useDriverLocation();
  const cameraRef = useRef<ComponentRef<typeof Mapbox.Camera>>(null);
  const [pins, setPins] = useState<Record<string, Coord>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Geocode each delivery's area to a pin (fallback until backend coords ship).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, Coord> = {};
      for (const d of deliveries) {
        if (!d.area) continue;
        const c = await geocodeArea(d.area);
        if (c) next[d.id] = c;
      }
      if (!cancelled) setPins(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [deliveries]);

  const center = driver ?? CONAKRY;
  const selected = useMemo(
    () => deliveries.find((d) => d.id === selectedId) ?? null,
    [deliveries, selectedId],
  );
  const selectedPin = selectedId ? pins[selectedId] : undefined;

  const recenter = () => {
    cameraRef.current?.setCamera({
      centerCoordinate: [center.lng, center.lat],
      zoomLevel: 13,
      animationDuration: 600,
    });
  };

  const routeGeoJSON = useMemo(() => {
    if (!driver || !selectedPin) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [driver.lng, driver.lat],
          [selectedPin.lng, selectedPin.lat],
        ],
      },
    };
  }, [driver, selectedPin]);

  if (!HAS_TOKEN) {
    return (
      <Screen testID="map-screen">
        <EmptyState
          testID="map-no-token"
          title="Carte indisponible"
          description="La configuration de la carte est manquante. Réessaie après la prochaine mise à jour."
        />
      </Screen>
    );
  }

  if (status === 'denied') {
    return (
      <Screen testID="map-screen">
        <EmptyState
          testID="map-permission"
          title="Localisation requise"
          description="Active la localisation pour voir la carte de tes livraisons et te repérer."
          action={
            <View className="gap-2">
              <Button
                testID="map-permission-retry"
                label="Réessayer"
                onPress={() => void retry()}
              />
              <Button
                testID="map-permission-settings"
                variant="ghost"
                label="Ouvrir les réglages"
                onPress={() => void Linking.openSettings()}
              />
            </View>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} testID="map-screen">
      <View className="flex-1">
        <Mapbox.MapView
          testID="map-view"
          style={{ flex: 1 }}
          styleURL={Mapbox.StyleURL.Street}
          scaleBarEnabled={false}
          onPress={() => setSelectedId(null)}
        >
          <Mapbox.Camera
            ref={cameraRef}
            defaultSettings={{ centerCoordinate: [center.lng, center.lat], zoomLevel: 12 }}
          />

          {driver ? (
            <Mapbox.PointAnnotation id="driver" coordinate={[driver.lng, driver.lat]}>
              <View className="h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-brand-600 shadow-sm" />
            </Mapbox.PointAnnotation>
          ) : null}

          {deliveries.map((d) => {
            const pin = pins[d.id];
            if (!pin) return null;
            const on = d.id === selectedId;
            return (
              <Mapbox.PointAnnotation
                key={d.id}
                id={`client-${d.id}`}
                coordinate={[pin.lng, pin.lat]}
                onSelected={() => setSelectedId(d.id)}
              >
                <View
                  className={cn(
                    'h-7 w-7 items-center justify-center rounded-full border-2 border-surface shadow-sm',
                    on ? 'bg-brand-600' : 'bg-accent',
                  )}
                >
                  <QrCode size={14} color={colors.surface} strokeWidth={2.5} />
                </View>
              </Mapbox.PointAnnotation>
            );
          })}

          {routeGeoJSON ? (
            <Mapbox.ShapeSource id="route" shape={routeGeoJSON}>
              <Mapbox.LineLayer
                id="route-line"
                style={{
                  lineColor: colors.brand600,
                  lineWidth: 4,
                  lineCap: 'round',
                  lineDasharray: [2, 2],
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}
        </Mapbox.MapView>

        {/* Recenter */}
        <Pressable
          testID="map-recenter"
          accessibilityRole="button"
          accessibilityLabel="Recentrer sur ma position"
          onPress={recenter}
          style={{ position: 'absolute', right: 16, top: insets.top + 12 }}
          className="h-11 w-11 items-center justify-center rounded-full bg-surface shadow-md"
        >
          <Crosshair size={20} color={colors.brand600} strokeWidth={2.25} />
        </Pressable>

        {/* Selected-delivery bottom sheet */}
        {selected ? (
          <View
            testID="map-sheet"
            style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 12 }}
            className="gap-3 rounded-card bg-surface p-4 shadow-lg"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 gap-0.5">
                <AppText variant="caption" className="text-ink-muted">
                  {selected.orderRef}
                </AppText>
                <AppText variant="label">{selected.area || 'Zone indisponible'}</AppText>
                <AppText variant="caption" className="text-ink-faint">
                  {remainingLabel(selected.createdAt)}
                  {selectedPin ? '' : ' · position approximative'}
                </AppText>
              </View>
              <Pressable
                testID="map-sheet-close"
                accessibilityLabel="Fermer"
                hitSlop={10}
                onPress={() => setSelectedId(null)}
                className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted"
              >
                <X size={16} color={colors.ink} strokeWidth={2.25} />
              </Pressable>
            </View>
            <Button
              testID="map-sheet-scan"
              label="Scanner la livraison"
              onPress={() =>
                router.push({ pathname: '/delivery/[id]', params: { id: selected.id } })
              }
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
