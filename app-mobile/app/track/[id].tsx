// Buyer-side live courier tracking. Polls /get-order every 12s (useOrderTracking)
// and renders the courier's last position + the drop-off on a Mapbox map, following
// the driver as it moves. Reuses the same Mapbox setup as PropertyLocationMap. The
// driver streams its GPS from the Linky Driver app (update-livreur-location); this
// screen is purely a consumer — no location of the buyer's own is read.
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import Mapbox, { MapView, Camera, PointAnnotation, ShapeSource, LineLayer } from '@rnmapbox/maps';

import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Card } from '../../src/components/primitives/Card';
import { TopBar } from '../../src/components/nav/TopBar';
import { DetailStateScreen } from '../../src/components/feedback/DetailState';
import { useOrderTracking } from '../../src/data/queries';

// Idempotent — same init the other Mapbox screens use.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? null);

function freshness(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  return `il y a ${Math.floor(min / 60)} h`;
}

export default function TrackRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data: order, isLoading, isError, refetch } = useOrderTracking(id);
  const cameraRef = useRef<Camera>(null);

  const delivery = order?.delivery ?? null;
  const driver = delivery?.livreurLocation ?? null;
  const client = delivery?.clientLocation ?? null;

  const points = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    if (driver) pts.push([driver.lng, driver.lat]);
    if (client) pts.push([client.lng, client.lat]);
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- track the coord values, not the object refs
  }, [driver?.lat, driver?.lng, client?.lat, client?.lng]);

  // Follow the driver / fit both points as the position streams in.
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam || points.length === 0) return;
    if (points.length === 1) {
      cam.setCamera({ centerCoordinate: points[0], zoomLevel: 14, animationDuration: 600 });
      return;
    }
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    cam.fitBounds(
      [Math.max(...lngs), Math.max(...lats)],
      [Math.min(...lngs), Math.min(...lats)],
      [90, 60, 240, 60],
      800,
    );
  }, [points]);

  if (isLoading || isError || !order) {
    return (
      <DetailStateScreen
        loading={isLoading}
        title="Suivi indisponible"
        onRetry={() => void refetch()}
      />
    );
  }

  const isDone = delivery?.status === 'delivered' || order.status === 'released';
  const updated = driver ? freshness(driver.at) : null;

  let statusLine: string;
  if (isDone) {
    statusLine = 'Ta commande a été livrée ✅';
  } else if (!delivery?.livreurId) {
    statusLine = "Aucun livreur n'est encore assigné à ta commande.";
  } else if (!driver) {
    statusLine = `${delivery.livreurName ?? 'Ton livreur'} prépare ta livraison — sa position s'affichera dès qu'il prend la route.`;
  } else {
    statusLine = `${delivery.livreurName ?? 'Ton livreur'} est en route vers toi.`;
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Suivi du livreur" back subtitle={`#${order.reference}`} />
      <View style={{ flex: 1 }}>
        {points.length > 0 ? (
          <MapView
            style={{ flex: 1 }}
            styleURL="mapbox://styles/mapbox/streets-v12"
            compassEnabled={false}
            scaleBarEnabled={false}
            logoEnabled
            attributionEnabled
          >
            <Camera
              ref={cameraRef}
              defaultSettings={{ centerCoordinate: points[0], zoomLevel: 13 }}
            />
            {driver && client ? (
              <ShapeSource
                id="track-route"
                shape={{
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: [
                      [driver.lng, driver.lat],
                      [client.lng, client.lat],
                    ],
                  },
                }}
              >
                <LineLayer
                  id="track-line"
                  style={{
                    lineColor: colors.primary,
                    lineWidth: 4,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </ShapeSource>
            ) : null}
            {client ? (
              <PointAnnotation id="client" coordinate={[client.lng, client.lat]}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                    borderWidth: 3,
                    borderColor: '#FFFFFF',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 13 }}>🏠</Text>
                </View>
              </PointAnnotation>
            ) : null}
            {driver ? (
              <PointAnnotation id="driver" coordinate={[driver.lng, driver.lat]}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    backgroundColor: colors.text,
                    borderWidth: 3,
                    borderColor: '#FFFFFF',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 15 }}>🛵</Text>
                </View>
              </PointAnnotation>
            ) : null}
          </MapView>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ fontSize: 30 }}>📍</Text>
            <Text
              tone="muted"
              center
              style={{ marginTop: 10, letterSpacing: 0, textTransform: 'none' }}
            >
              La position du livreur n'est pas encore disponible.
            </Text>
          </View>
        )}

        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 16 }}>
          <Card padding={16} elevated>
            <Text variant="bodyMSemibold">{statusLine}</Text>
            {updated && !isDone ? (
              <Text
                variant="micro"
                tone="muted"
                style={{ marginTop: 4, letterSpacing: 0, textTransform: 'none' }}
              >
                Position mise à jour {updated}
              </Text>
            ) : null}
            {delivery?.city && !isDone ? (
              <Text
                variant="micro"
                tone="muted"
                style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}
              >
                Livraison à {delivery.city}
              </Text>
            ) : null}
          </Card>
        </View>
      </View>
    </SafeAreaView>
  );
}
