// Phase R.1 — real Mapbox map on property detail (replaces the decorative SVG).
//
// Static preview by design : gestures stay disabled so the map never fights
// the parent ScrollView, and tiles render once (3G law — no continuous tile
// streaming while the user scrolls the page). « Itinéraire » hands off to the
// device's maps app — native turn-by-turn beats anything we'd embed, costs
// zero Mapbox quota, and works offline once the OS app has cached the area.
import { Linking, Platform, Pressable, View } from 'react-native';
import Mapbox, { MapView, Camera, PointAnnotation } from '@rnmapbox/maps';
import { Navigation } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';

// Idempotent — same init as CityMapPicker.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? null);

export function openDirections(lat: number, lng: number, label: string) {
  haptic.light();
  const encoded = encodeURIComponent(label);
  const native = Platform.select({
    ios: `maps:0,0?q=${encoded}@${lat},${lng}`,
    android: `geo:0,0?q=${lat},${lng}(${encoded})`,
  });
  const web = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (!native) {
    void Linking.openURL(web);
    return;
  }
  Linking.openURL(native).catch(() => Linking.openURL(web));
}

export function PropertyLocationMap({
  lat,
  lng,
  label,
}: {
  lat: number;
  lng: number;
  label: string;
}) {
  const { colors } = useTheme();
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

  return (
    <View
      style={{
        aspectRatio: 16 / 9,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: colors.bgSunken,
        marginBottom: 10,
      }}
    >
      {!hasGps || Platform.OS === 'web' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Text variant="caption" tone="muted" center style={{ letterSpacing: 0 }}>
            {!hasGps ? 'Position GPS non renseignée pour cette annonce.' : "La carte n'est pas disponible sur le web."}
          </Text>
        </View>
      ) : (
        <>
          <MapView
            style={{ flex: 1 }}
            styleURL="mapbox://styles/mapbox/streets-v12"
            compassEnabled={false}
            scaleBarEnabled={false}
            logoEnabled={true}
            attributionEnabled={true}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            <Camera
              defaultSettings={{
                centerCoordinate: [lng, lat],
                zoomLevel: 14,
              }}
              animationDuration={0}
            />
            <PointAnnotation id="property-pin" coordinate={[lng, lat]}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                  borderWidth: 3,
                  borderColor: '#FFFFFF',
                  shadowColor: '#000',
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 4,
                }}
              />
            </PointAnnotation>
          </MapView>
          <Pressable
            onPress={() => openDirections(lat, lng, label)}
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              height: 34,
              borderRadius: 999,
              backgroundColor: colors.text,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
              elevation: 5,
            }}
          >
            <Navigation size={13} color={colors.bg} strokeWidth={2.5} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.bg }}>Itinéraire</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
