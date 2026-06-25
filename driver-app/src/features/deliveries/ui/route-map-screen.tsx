import Mapbox from '@rnmapbox/maps';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import { env } from '@/shared/lib/env';
import { logger } from '@/shared/lib/logger';
import { colors } from '@/shared/theme/colors';
import { AppText, Button, Card, EmptyState, Screen, Skeleton } from '@/shared/ui';

import { getDelivery } from '../lib/deliveries-api';
import { boundsOf, formatDistanceKm, haversineKm } from '../lib/geo';
import { type DeliveryDetail, type LatLng } from '../model/schema';

// The Mapbox PUBLIC token (pk.…) is configured ONCE at import. Empty → the screen
// renders a graceful placeholder instead of a map (owner sets
// EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN at runtime + the MAPBOX_DOWNLOAD_TOKEN build secret
// in the EAS env). This is the SAME public token the Carte tab uses. We also disable
// Mapbox telemetry (privacy).
const MAPBOX_TOKEN = env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (MAPBOX_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
  Mapbox.setTelemetryEnabled(false);
}

function formatGnf(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} GNF`;
}

/** Mapbox wants [lng, lat]. */
const toLngLat = (p: LatLng): [number, number] => [p.lng, p.lat];

/**
 * « Voir l'itinéraire » — the in-app route map (spec: pickup → client). Draws the
 * boutique pickup, the client drop-off, and the driver's live GPS, with the
 * boutique→client distance and a product card. Coords come from get-delivery (no
 * client-side geocoding). The driver's own position is read on-device via
 * expo-location (foreground only) and never sent anywhere.
 */
export function RouteMapScreen({ id }: { id: string }) {
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [driver, setDriver] = useState<LatLng | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const loadDetail = useCallback(async () => {
    setPhase('loading');
    try {
      setDetail(await getDelivery(id));
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, [id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  // Live driver position (foreground). Denied permission simply omits the driver dot —
  // the boutique + client still render. Best-effort; never blocks the map.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || !active) return;
        watchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 5000 },
          (loc) => setDriver({ lat: loc.coords.latitude, lng: loc.coords.longitude }),
        );
      } catch (e) {
        logger.warn('[route-map] location watch failed', e);
      }
    })();
    return () => {
      active = false;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, []);

  const pickupCoord = useMemo<LatLng | null>(() => {
    const p = detail?.pickup;
    return p && p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null;
  }, [detail]);
  const clientCoord = detail?.clientLocation ?? null;

  const distanceLabel = useMemo(() => {
    if (!pickupCoord || !clientCoord) return null;
    return formatDistanceKm(haversineKm(pickupCoord, clientCoord));
  }, [pickupCoord, clientCoord]);

  const bounds = useMemo(
    () => boundsOf([pickupCoord, clientCoord, driver].filter((p): p is LatLng => p != null)),
    [pickupCoord, clientCoord, driver],
  );

  const openInMaps = useCallback(() => {
    const target = clientCoord ?? pickupCoord;
    if (!target) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
    void Linking.openURL(url).catch((e) => logger.warn('[route-map] openURL failed', e));
  }, [clientCoord, pickupCoord]);

  if (phase === 'loading') {
    return (
      <Screen testID="route-map-screen">
        <View className="gap-3 pt-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-20 w-full" />
        </View>
      </Screen>
    );
  }

  if (phase === 'error' || !detail) {
    return (
      <Screen testID="route-map-screen">
        <EmptyState
          testID="route-map-error"
          title="Impossible de charger l’itinéraire"
          description="Vérifie ta connexion et réessaie."
          action={
            <Button testID="route-map-retry" label="Réessayer" onPress={() => void loadDetail()} />
          }
        />
      </Screen>
    );
  }

  const canShowMap = !!MAPBOX_TOKEN && (!!pickupCoord || !!clientCoord);
  const pickupName = detail.pickup?.name || 'Boutique';
  const pickupCity = detail.pickup?.city || '';

  return (
    <Screen testID="route-map-screen">
      <View className="flex-1 gap-3 pt-2">
        <View
          className="overflow-hidden rounded-card border border-ink-faint/15"
          style={{ flex: 1 }}
        >
          {canShowMap ? (
            <Mapbox.MapView
              testID="route-map"
              style={{ flex: 1 }}
              styleURL={Mapbox.StyleURL.Street}
              scaleBarEnabled={false}
              logoEnabled
              attributionEnabled
            >
              {bounds ? (
                <Mapbox.Camera
                  defaultSettings={{
                    bounds: {
                      ...bounds,
                      paddingTop: 64,
                      paddingBottom: 64,
                      paddingLeft: 48,
                      paddingRight: 48,
                    },
                  }}
                  bounds={{
                    ...bounds,
                    paddingTop: 64,
                    paddingBottom: 64,
                    paddingLeft: 48,
                    paddingRight: 48,
                  }}
                  animationDuration={0}
                />
              ) : null}

              {pickupCoord && clientCoord ? (
                <Mapbox.ShapeSource
                  id="route"
                  shape={{
                    type: 'Feature',
                    properties: {},
                    geometry: {
                      type: 'LineString',
                      coordinates: [toLngLat(pickupCoord), toLngLat(clientCoord)],
                    },
                  }}
                >
                  <Mapbox.LineLayer
                    id="route-line"
                    style={{
                      lineColor: colors.brand500,
                      lineWidth: 3,
                      lineCap: 'round',
                      lineDasharray: [2, 1],
                    }}
                  />
                </Mapbox.ShapeSource>
              ) : null}

              {pickupCoord ? (
                <Mapbox.PointAnnotation id="pickup" coordinate={toLngLat(pickupCoord)}>
                  <View
                    className="h-11 w-11 items-center justify-center rounded-full border-2 border-brand-600 bg-surface"
                    testID="route-map-pickup-marker"
                  >
                    {detail.itemPhoto ? (
                      <Image
                        source={{ uri: detail.itemPhoto }}
                        style={{ width: 36, height: 36, borderRadius: 18 }}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <AppText className="text-base">📦</AppText>
                    )}
                  </View>
                </Mapbox.PointAnnotation>
              ) : null}

              {clientCoord ? (
                <Mapbox.PointAnnotation id="client" coordinate={toLngLat(clientCoord)}>
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-600">
                    <AppText className="text-base">🏠</AppText>
                  </View>
                </Mapbox.PointAnnotation>
              ) : null}

              {driver ? (
                <Mapbox.PointAnnotation id="driver" coordinate={toLngLat(driver)}>
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
                    <AppText className="text-base">🛵</AppText>
                  </View>
                </Mapbox.PointAnnotation>
              ) : null}
            </Mapbox.MapView>
          ) : (
            <View
              testID="route-map-unavailable"
              className="flex-1 items-center justify-center gap-2 bg-surface-muted p-6"
            >
              <AppText variant="title">🗺️</AppText>
              <AppText variant="label" className="text-center">
                {MAPBOX_TOKEN ? 'Position approximative indisponible' : 'Carte indisponible'}
              </AppText>
              <AppText variant="caption" className="text-center">
                {MAPBOX_TOKEN
                  ? 'Les coordonnées de cette livraison ne sont pas encore disponibles.'
                  : 'La carte sera activée une fois la configuration Mapbox terminée. Tu peux ouvrir l’itinéraire dans Maps.'}
              </AppText>
            </View>
          )}
        </View>

        {/* Product + pickup card. "at pickup": this is the boutique leg of the route. */}
        <Card className="flex-row gap-3" testID="route-map-product">
          <Image
            source={detail.itemPhoto ? { uri: detail.itemPhoto } : undefined}
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              backgroundColor: colors.surfaceMuted,
            }}
            contentFit="cover"
            transition={150}
            accessibilityLabel={detail.itemTitle || 'Article à livrer'}
            accessibilityIgnoresInvertColors
          />
          <View className="flex-1 gap-0.5">
            <AppText variant="caption" className="text-ink-muted">
              Retrait : {[pickupName, pickupCity].filter(Boolean).join(' · ')}
            </AppText>
            <AppText variant="label" numberOfLines={1}>
              {detail.itemTitle || 'Article'}
            </AppText>
            <AppText variant="caption">{formatGnf(detail.amountGnf)}</AppText>
            {distanceLabel ? (
              <AppText variant="caption" className="text-brand-700" testID="route-map-distance">
                Boutique → client : {distanceLabel}
              </AppText>
            ) : null}
          </View>
        </Card>

        {clientCoord || pickupCoord ? (
          <Button
            testID="route-map-open-external"
            variant="secondary"
            label="Ouvrir dans Maps"
            onPress={openInMaps}
          />
        ) : null}
      </View>
    </Screen>
  );
}
