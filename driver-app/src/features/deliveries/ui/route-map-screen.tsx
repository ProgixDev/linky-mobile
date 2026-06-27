import Mapbox from '@rnmapbox/maps';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { ArrowUpRight, ChevronLeft, Clock, Navigation } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { env } from '@/shared/lib/env';
import { logger } from '@/shared/lib/logger';
import { colors } from '@/shared/theme/colors';
import { AppText, Button, EmptyState, Screen, Skeleton } from '@/shared/ui';

import { getDelivery } from '../lib/deliveries-api';
import { boundsOf, formatDistanceKm, haversineKm } from '../lib/geo';
import { type DeliveryDetail, type LatLng } from '../model/schema';

// The Mapbox PUBLIC token (pk.…) is configured ONCE at import. Empty → the screen
// renders a graceful placeholder instead of a map. Same public token the Carte tab uses.
const MAPBOX_TOKEN = env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (MAPBOX_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
  Mapbox.setTelemetryEnabled(false);
}

/** Rough city speed for the live ETA (no routing API — straight-line / avg). */
const AVG_SPEED_KMH = 25;

function formatGnf(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} GNF`;
}

/** Mapbox wants [lng, lat]. */
const toLngLat = (p: LatLng): [number, number] => [p.lng, p.lat];

/**
 * « Voir l'itinéraire » — the in-app tracking map (full-bleed map + a floating sheet
 * with the live ETA, the client address, and the product). The route line + the ETA
 * track DRIVER → client in real time: the driver's foreground GPS (expo-location) is
 * read on-device, so as the courier moves the line redraws and the « ~X min » counts
 * down. Coords come from get-delivery (no client-side geocoding); the driver position
 * is never sent anywhere.
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
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 5000 },
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

  // The LIVE leg: from the driver's current position (fallback: boutique) to the client.
  // Updates whenever `driver` changes → the line + ETA + distance are real-time.
  const lineFrom = driver ?? pickupCoord;
  const distanceKm = useMemo(
    () => (lineFrom && clientCoord ? haversineKm(lineFrom, clientCoord) : null),
    [lineFrom, clientCoord],
  );
  const distanceLabel = distanceKm != null ? formatDistanceKm(distanceKm) : null;
  const etaMin =
    distanceKm != null ? Math.max(1, Math.round((distanceKm / AVG_SPEED_KMH) * 60)) : null;

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
          <Skeleton className="h-24 w-full" />
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
  const area =
    [detail.addressCity, detail.addressDistrict].filter(Boolean).join(' · ') || 'Zone indisponible';
  const address = [detail.addressDetails, area].filter(Boolean).join(' — ');

  return (
    <Screen padded={false} testID="route-map-screen">
      <View className="flex-1">
        {/* MAP (full-bleed) — or a graceful placeholder when coords/token are missing. */}
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
                    paddingTop: 96,
                    paddingBottom: 300,
                    paddingLeft: 56,
                    paddingRight: 56,
                  },
                }}
                bounds={{
                  ...bounds,
                  paddingTop: 96,
                  paddingBottom: 300,
                  paddingLeft: 56,
                  paddingRight: 56,
                }}
                animationDuration={600}
              />
            ) : null}

            {lineFrom && clientCoord ? (
              <Mapbox.ShapeSource
                id="route"
                shape={{
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: [toLngLat(lineFrom), toLngLat(clientCoord)],
                  },
                }}
              >
                <Mapbox.LineLayer
                  id="route-line"
                  style={{
                    lineColor: colors.brand600,
                    lineWidth: 4,
                    lineCap: 'round',
                    lineJoin: 'round',
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
                <View className="h-10 w-10 items-center justify-center rounded-full border-2 border-surface bg-brand-600">
                  <AppText className="text-base">🏠</AppText>
                </View>
              </Mapbox.PointAnnotation>
            ) : null}

            {driver ? (
              <Mapbox.PointAnnotation id="driver" coordinate={toLngLat(driver)}>
                <View className="h-10 w-10 items-center justify-center rounded-full border-2 border-surface bg-ink">
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
                : 'La carte sera activée une fois la configuration Mapbox terminée.'}
            </AppText>
          </View>
        )}

        {/* Floating back button over the map. */}
        <Pressable
          testID="route-map-back"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          className="absolute left-4 top-4 h-10 w-10 items-center justify-center rounded-full bg-surface shadow-lg"
        >
          <ChevronLeft size={22} color={colors.ink} strokeWidth={2.25} />
        </Pressable>

        {/* Floating tracking sheet: ETA · address · product (the reference layout). */}
        <View
          testID="route-map-sheet"
          className="absolute inset-x-0 bottom-0 gap-4 rounded-t-3xl border-t border-ink-faint/10 bg-surface px-5 pb-6 pt-3 shadow-2xl"
        >
          <View className="h-1 w-10 self-center rounded-full bg-ink-faint/25" />

          {/* ETA — counts down live as the courier closes the distance. */}
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-600">
              <Clock size={20} color={colors.surface} strokeWidth={2.25} />
            </View>
            <View className="flex-1">
              <AppText variant="caption" className="text-ink-muted">
                Temps estimé
              </AppText>
              <AppText variant="label">{etaMin != null ? `~${etaMin} min` : '—'}</AppText>
            </View>
            {distanceLabel ? (
              <View className="rounded-full bg-brand-50 px-3 py-1">
                <AppText
                  variant="caption"
                  className="font-sans-medium text-brand-700"
                  testID="route-map-distance"
                >
                  {distanceLabel}
                </AppText>
              </View>
            ) : null}
          </View>

          <View className="h-px bg-ink-faint/10" />

          {/* Destination address. */}
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-600">
              <Navigation size={18} color={colors.surface} strokeWidth={2.25} />
            </View>
            <View className="flex-1">
              <AppText variant="caption" className="text-ink-muted">
                Adresse de livraison
              </AppText>
              <AppText variant="label" numberOfLines={2} testID="route-map-address">
                {address || 'Adresse indisponible'}
              </AppText>
            </View>
          </View>

          {/* Product card + the green « ouvrir dans Maps » action (reference: place card). */}
          <View
            testID="route-map-product"
            className="flex-row items-center gap-3 rounded-card bg-surface-muted p-3"
          >
            <Image
              source={detail.itemPhoto ? { uri: detail.itemPhoto } : undefined}
              style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.surface }}
              contentFit="cover"
              transition={150}
              accessibilityLabel={detail.itemTitle || 'Article à livrer'}
              accessibilityIgnoresInvertColors
            />
            <View className="flex-1 gap-0.5">
              <AppText variant="label" numberOfLines={1}>
                {detail.itemTitle || 'Article'}
              </AppText>
              <AppText variant="caption" className="text-ink-muted">
                {[detail.orderRef, formatGnf(detail.amountGnf)].filter(Boolean).join(' · ')}
              </AppText>
            </View>
            {clientCoord || pickupCoord ? (
              <Pressable
                testID="route-map-open-external"
                onPress={openInMaps}
                accessibilityRole="button"
                accessibilityLabel="Ouvrir dans Maps"
                className="h-11 w-11 items-center justify-center rounded-full bg-brand-600"
              >
                <ArrowUpRight size={20} color={colors.surface} strokeWidth={2.5} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Screen>
  );
}
