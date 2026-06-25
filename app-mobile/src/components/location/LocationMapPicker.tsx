// Reusable exact-point picker (shop location + delivery address). Search a place,
// tap the map, or drag the pin to set the precise GPS — overrides the city-centroid
// default. Mirrors the property location screen's map setup; reused via props so a
// form just holds {lat,lng} state. French, Linky green, app theme + Mapbox token.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native';
import Mapbox, { Camera, MapView, PointAnnotation, type ScreenPointPayload } from '@rnmapbox/maps';
import type { Feature, Point } from 'geojson';
import { Navigation, Search, X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';

// Idempotent — same init as CityMapPicker / PropertyLocationMap.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? null);
const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

const CONAKRY: [number, number] = [-13.5784, 9.6412]; // [lng, lat]

function coordLabel(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'O'}`;
}

export function LocationMapPicker({
  lat,
  lng,
  onChange,
  testID,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const cameraRef = useRef<Camera>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  // Recenter when the coords change from ANY source (tap, drag, search, GPS).
  useEffect(() => {
    if (lat == null || lng == null || !cameraRef.current) return;
    cameraRef.current.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: 15,
      animationDuration: 500,
    });
  }, [lat, lng]);

  function setFromCoords(coords: number[] | undefined) {
    if (!coords || coords.length < 2) return;
    const lo = coords[0];
    const la = coords[1];
    if (typeof lo !== 'number' || typeof la !== 'number') return;
    haptic.selection();
    onChange(la, lo);
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q || !TOKEN || searching) return;
    setSearching(true);
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${q}, Guinée`)}.json` +
        `?limit=1&language=fr&country=gn&access_token=${TOKEN}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = (await res.json()) as { features?: { center?: [number, number] }[] };
      setFromCoords(json.features?.[0]?.center);
    } catch {
      // best-effort search
    } finally {
      setSearching(false);
    }
  }

  async function handleMyPosition() {
    try {
      const Location = await import('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      haptic.selection();
      onChange(pos.coords.latitude, pos.coords.longitude);
    } catch {
      // GPS unavailable on this dev client — the tap/search paths still work.
    }
  }

  return (
    <View style={{ gap: 8 }} testID={testID}>
      {/* Search */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          height: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <Search size={16} color={colors.textFaint} />
        <TextInput
          testID={testID ? `${testID}-search` : undefined}
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher un lieu…"
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          style={{ flex: 1, fontSize: 15, color: colors.text }}
        />
        {searching ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <X size={16} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      {/* Map */}
      <View style={{ aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.bgSunken }}>
        {Platform.OS === 'web' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <Text variant="caption" tone="muted" center style={{ letterSpacing: 0 }}>
              La carte n'est pas disponible sur le web.
            </Text>
          </View>
        ) : (
          <MapView
            testID={testID ? `${testID}-map` : undefined}
            style={{ flex: 1 }}
            styleURL="mapbox://styles/mapbox/streets-v12"
            compassEnabled={false}
            scaleBarEnabled={false}
            onPress={(f: Feature<Point, ScreenPointPayload>) => setFromCoords(f.geometry?.coordinates)}
          >
            <Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: hasCoords ? [lng, lat] : CONAKRY,
                zoomLevel: hasCoords ? 15 : 11,
              }}
            />
            {hasCoords && (
              <PointAnnotation
                id="picker-pin"
                coordinate={[lng, lat]}
                draggable
                onDragEnd={(f) => setFromCoords((f as Feature<Point>).geometry?.coordinates)}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                    borderWidth: 4,
                    borderColor: '#FFFFFF',
                    shadowColor: '#000',
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 4,
                  }}
                />
              </PointAnnotation>
            )}
          </MapView>
        )}

        {/* Ma position */}
        <Pressable
          testID={testID ? `${testID}-gps` : undefined}
          onPress={handleMyPosition}
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            height: 36,
            width: 36,
            borderRadius: 999,
            backgroundColor: colors.text,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 5,
            shadowOffset: { width: 0, height: 2 },
            elevation: 5,
          }}
        >
          <Navigation size={15} color={colors.bg} strokeWidth={2.5} />
        </Pressable>

        {/* Hint / coords chip */}
        <View style={{ position: 'absolute', top: 10, left: 10, right: 10, alignItems: 'flex-start' }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#13251C', fontVariant: ['tabular-nums'] }}>
              {hasCoords ? coordLabel(lat, lng) : 'Touche la carte pour placer le point exact'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
