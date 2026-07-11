import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import Mapbox, { MapView, Camera, PointAnnotation, type ScreenPointPayload } from '@rnmapbox/maps';
import * as Location from 'expo-location';
import type { Feature, Point } from 'geojson';
import { Check, LocateFixed, MapPin } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';

// Idempotent — safe to call multiple times. Reads the public token from EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? null);

// A build that ships WITHOUT the public token crashes the native MapView on
// mount — fatal here because this is the sign-up city step (blocks every new
// user). When the token is absent we skip the map entirely; the region tabs +
// city chips below still let the user pick a city, so onboarding never blocks.
const HAS_MAPBOX_TOKEN = !!(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '').trim();

export interface GuineaCity {
  name: string;
  region: string;
  lat: number;
  lng: number;
}

const REGIONS = [
  'Conakry',
  'Boké',
  'Kindia',
  'Labé',
  'Mamou',
  'Faranah',
  'Kankan',
  'Nzérékoré',
] as const;
type Region = (typeof REGIONS)[number];

// All 33 prefecture capitals of Guinea + Conakry's 5 communes + the rollup
// "Conakry" entry (kept for backwards-compat with existing properties that
// store city='Conakry'). The 8 administrative regions share their names with
// their capital cities. Conakry communes (Kaloum / Dixinn / Matam / Ratoma /
// Matoto) match Guinea's actual sub-municipal divisions — users in the capital
// can now pick their specific neighborhood instead of the metro-wide "Conakry".
export const GUINEA_CITIES: GuineaCity[] = [
  { name: 'Conakry', region: 'Conakry', lat: 9.6412, lng: -13.5784 },
  { name: 'Kaloum', region: 'Conakry', lat: 9.5092, lng: -13.7122 },
  { name: 'Dixinn', region: 'Conakry', lat: 9.5380, lng: -13.6800 },
  { name: 'Matam', region: 'Conakry', lat: 9.5483, lng: -13.6610 },
  { name: 'Ratoma', region: 'Conakry', lat: 9.5800, lng: -13.6550 },
  { name: 'Matoto', region: 'Conakry', lat: 9.5750, lng: -13.6011 },
  { name: 'Boké', region: 'Boké', lat: 10.9333, lng: -14.3 },
  { name: 'Boffa', region: 'Boké', lat: 10.1667, lng: -14.0333 },
  { name: 'Fria', region: 'Boké', lat: 10.3667, lng: -13.5833 },
  { name: 'Gaoual', region: 'Boké', lat: 11.7484, lng: -13.2056 },
  { name: 'Koundara', region: 'Boké', lat: 12.4789, lng: -13.3025 },
  { name: 'Kindia', region: 'Kindia', lat: 10.0566, lng: -12.8651 },
  { name: 'Coyah', region: 'Kindia', lat: 9.7167, lng: -13.3833 },
  { name: 'Dubréka', region: 'Kindia', lat: 9.7903, lng: -13.5217 },
  { name: 'Forécariah', region: 'Kindia', lat: 9.4297, lng: -13.0875 },
  { name: 'Télimélé', region: 'Kindia', lat: 10.9069, lng: -13.0319 },
  { name: 'Labé', region: 'Labé', lat: 11.3175, lng: -12.2833 },
  { name: 'Koubia', region: 'Labé', lat: 11.7833, lng: -11.9667 },
  { name: 'Lélouma', region: 'Labé', lat: 11.45, lng: -12.7 },
  { name: 'Mali', region: 'Labé', lat: 12.0833, lng: -12.3 },
  { name: 'Tougué', region: 'Labé', lat: 11.4456, lng: -11.6789 },
  { name: 'Mamou', region: 'Mamou', lat: 10.3754, lng: -12.0913 },
  { name: 'Dalaba', region: 'Mamou', lat: 10.6857, lng: -12.2503 },
  { name: 'Pita', region: 'Mamou', lat: 10.7708, lng: -12.4017 },
  { name: 'Faranah', region: 'Faranah', lat: 10.0333, lng: -10.7333 },
  { name: 'Dabola', region: 'Faranah', lat: 10.7497, lng: -11.1133 },
  { name: 'Dinguiraye', region: 'Faranah', lat: 11.3, lng: -10.7167 },
  { name: 'Kissidougou', region: 'Faranah', lat: 9.1842, lng: -10.1011 },
  { name: 'Kankan', region: 'Kankan', lat: 10.3854, lng: -9.3056 },
  { name: 'Kérouané', region: 'Kankan', lat: 9.2667, lng: -9.0167 },
  { name: 'Kouroussa', region: 'Kankan', lat: 10.6517, lng: -9.8856 },
  { name: 'Mandiana', region: 'Kankan', lat: 10.6333, lng: -8.6833 },
  { name: 'Siguiri', region: 'Kankan', lat: 11.4178, lng: -9.166 },
  { name: 'Nzérékoré', region: 'Nzérékoré', lat: 7.7548, lng: -8.8186 },
  { name: 'Beyla', region: 'Nzérékoré', lat: 8.6889, lng: -8.6486 },
  { name: 'Guéckédou', region: 'Nzérékoré', lat: 8.5667, lng: -10.1333 },
  { name: 'Lola', region: 'Nzérékoré', lat: 7.8019, lng: -8.5278 },
  { name: 'Macenta', region: 'Nzérékoré', lat: 8.5375, lng: -9.4708 },
  { name: 'Yomou', region: 'Nzérékoré', lat: 7.5664, lng: -9.2592 },
];

const GUINEA_CENTER: [number, number] = [-11.0, 10.0]; // [lng, lat] — Mapbox uses lng-first
const GUINEA_ZOOM = 5.5;

function planarDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function nearestCity(lat: number, lng: number): GuineaCity {
  let best = GUINEA_CITIES[0]!;
  let bestD = Infinity;
  for (const c of GUINEA_CITIES) {
    const d = planarDistance({ lat, lng }, { lat: c.lat, lng: c.lng });
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function CityMapPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (city: string) => void;
}) {
  const { colors, radii } = useTheme();
  const initialRegion = (GUINEA_CITIES.find((c) => c.name === value)?.region ??
    'Conakry') as Region;
  const [activeRegion, setActiveRegion] = useState<Region>(initialRegion);
  const regionScrollRef = useRef<ScrollView | null>(null);
  const cityScrollRef = useRef<ScrollView | null>(null);
  const regionTabLayouts = useRef<Record<string, { x: number; w: number }>>({});
  const cityChipLayouts = useRef<Record<string, { x: number; w: number }>>({});
  const cameraRef = useRef<Camera>(null);

  const selectedCity = useMemo(
    () => GUINEA_CITIES.find((c) => c.name === value),
    [value],
  );

  const citiesInRegion = useMemo(
    () => GUINEA_CITIES.filter((c) => c.region === activeRegion),
    [activeRegion],
  );

  // Keep the active region tab and selected city chip in view
  useEffect(() => {
    const r = regionTabLayouts.current[activeRegion];
    if (r && regionScrollRef.current) {
      regionScrollRef.current.scrollTo({ x: Math.max(0, r.x - 16), animated: true });
    }
  }, [activeRegion]);

  useEffect(() => {
    const c = cityChipLayouts.current[value];
    if (c && cityScrollRef.current) {
      cityScrollRef.current.scrollTo({ x: Math.max(0, c.x - 16), animated: true });
    }
  }, [value, activeRegion]);

  // Pan/zoom the map whenever the selected city changes
  useEffect(() => {
    if (!selectedCity || !cameraRef.current) return;
    cameraRef.current.setCamera({
      centerCoordinate: [selectedCity.lng, selectedCity.lat],
      zoomLevel: 8,
      animationDuration: 600,
    });
  }, [selectedCity]);

  const handleSelect = (cityName: string) => {
    haptic.selection();
    manuallyPicked.current = true;
    onChange(cityName);
    const c = GUINEA_CITIES.find((x) => x.name === cityName);
    if (c && c.region !== activeRegion) setActiveRegion(c.region as Region);
  };

  // Location permission is requested HERE — the natural moment, when the
  // signup map opens (client 2026-07-07: was popping unprompted on the Marché
  // tab). On grant we center the map on the user and pre-select their nearest
  // Guinea city (unless they've already tapped one). On deny, nothing happens —
  // they pick manually. The Marché distance badge later reuses this grant
  // without ever prompting again.
  // Seed from any pre-existing value: on the Edit-profile / address screens a
  // city is already set, and auto-detect must NOT overwrite it (review 2026-07-07).
  const manuallyPicked = useRef(!!value);
  const [locating, setLocating] = useState(false);
  const detectMyLocation = async (prompt: boolean) => {
    try {
      setLocating(true);
      const perm = prompt
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      if (!latitude && !longitude) return;
      cameraRef.current?.setCamera({
        centerCoordinate: [longitude, latitude],
        zoomLevel: 9,
        animationDuration: 600,
      });
      // Only auto-fill the city if the user hasn't chosen one yet.
      if (!manuallyPicked.current) {
        const near = nearestCity(latitude, longitude);
        onChange(near.name);
        if (near.region !== activeRegion) setActiveRegion(near.region as Region);
      }
    } catch {
      // GPS off / timeout — silent; manual city pick still works.
    } finally {
      setLocating(false);
    }
  };

  // Auto-request once when the map mounts (natural first moment) — ONLY during
  // fresh onboarding, where no city is chosen yet. When a value already exists
  // (Edit profile, addresses), auto-detect would overwrite the city and, on
  // screens that close the picker on change, snap it shut (review 2026-07-07).
  useEffect(() => {
    if (HAS_MAPBOX_TOKEN && !value) void detectMyLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mapbox onPress signature: Feature<Point, ScreenPointPayload>. Position is number[]
  // (potentially 3D with elevation), so we runtime-check both coords are present.
  const handleMapPress = (feature: Feature<Point, ScreenPointPayload>) => {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) return;
    const lng = coords[0];
    const lat = coords[1];
    if (typeof lng !== 'number' || typeof lat !== 'number') return;
    handleSelect(nearestCity(lat, lng).name);
  };

  return (
    <View style={{ flex: 1, gap: 12 }}>
      {/* Selected city banner */}
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: radii.md,
          borderWidth: 1.5,
          borderColor: colors.primary,
          backgroundColor: colors.primarySoft,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <MapPin size={18} color={colors.primary} strokeWidth={2.25} />
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.primaryDeep }}>
          {value}
        </Text>
        <Check size={16} color={colors.primary} strokeWidth={3} />
      </View>

      {/* Region tabs */}
      <View style={{ height: 36 }}>
        <ScrollView
          ref={regionScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 2, gap: 6, alignItems: 'center' }}
        >
          {REGIONS.map((r) => {
            const on = r === activeRegion;
            return (
              <Pressable
                key={r}
                onLayout={(e) => {
                  regionTabLayouts.current[r] = {
                    x: e.nativeEvent.layout.x,
                    w: e.nativeEvent.layout.width,
                  };
                }}
                onPress={() => {
                  haptic.selection();
                  setActiveRegion(r);
                }}
                style={{
                  height: 32,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: on ? colors.text : colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '600',
                    color: on ? colors.bg : colors.textMuted,
                    letterSpacing: 0.1,
                  }}
                >
                  {r}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* City chips for the active region */}
      <View style={{ height: 36 }}>
        <ScrollView
          ref={cityScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 2, gap: 6, alignItems: 'center' }}
        >
          {citiesInRegion.map((c) => {
            const on = c.name === value;
            return (
              <Pressable
                key={c.name}
                onLayout={(e) => {
                  cityChipLayouts.current[c.name] = {
                    x: e.nativeEvent.layout.x,
                    w: e.nativeEvent.layout.width,
                  };
                }}
                onPress={() => handleSelect(c.name)}
                style={{
                  height: 32,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: on ? colors.primary : colors.border,
                  backgroundColor: on ? colors.primarySoft : colors.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {on && <Check size={12} color={colors.primary} strokeWidth={3} />}
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '600',
                    color: on ? colors.primaryDeep : colors.text,
                    letterSpacing: 0.1,
                  }}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Map */}
      <View
        style={{
          flex: 1,
          borderRadius: radii.lg,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgSunken,
        }}
      >
        {Platform.OS === 'web' || !HAS_MAPBOX_TOKEN ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 }}>
            <MapPin size={22} color={colors.textMuted} strokeWidth={1.75} />
            <Text tone="muted" center style={{ letterSpacing: 0 }}>
              {Platform.OS === 'web'
                ? "La carte n'est pas disponible sur le web."
                : 'Sélectionne ta ville dans la liste ci-dessus.'}
            </Text>
          </View>
        ) : (
          <MapView
            style={{ flex: 1 }}
            styleURL="mapbox://styles/mapbox/streets-v12"
            compassEnabled={false}
            scaleBarEnabled={false}
            logoEnabled={true}
            attributionEnabled={true}
            onPress={handleMapPress}
          >
            <Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: selectedCity
                  ? [selectedCity.lng, selectedCity.lat]
                  : GUINEA_CENTER,
                zoomLevel: selectedCity ? 8 : GUINEA_ZOOM,
              }}
            />
            {GUINEA_CITIES.map((c) => (
              <PointAnnotation
                key={c.name}
                id={c.name}
                coordinate={[c.lng, c.lat]}
                onSelected={() => handleSelect(c.name)}
              >
                <View
                  style={{
                    width: c.name === value ? 18 : 12,
                    height: c.name === value ? 18 : 12,
                    borderRadius: 999,
                    backgroundColor: c.name === value ? colors.primary : colors.accent,
                    borderWidth: 2,
                    borderColor: '#fff',
                  }}
                />
              </PointAnnotation>
            ))}
          </MapView>
        )}

        {/* Locate-me — re-trigger the request (e.g. after a first refusal) and
            recenter on the user. */}
        {HAS_MAPBOX_TOKEN && Platform.OS !== 'web' && (
          <Pressable
            onPress={() => void detectMyLocation(true)}
            disabled={locating}
            accessibilityLabel="Utiliser ma position"
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              width: 44,
              height: 44,
              borderRadius: 999,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: locating ? 0.5 : 1,
            }}
          >
            <LocateFixed size={20} color={colors.primary} strokeWidth={2} />
          </Pressable>
        )}
      </View>

      <Text variant="caption" tone="muted" center style={{ letterSpacing: 0 }}>
        Touche un point sur la carte ou un marqueur pour choisir ta ville.
      </Text>
    </View>
  );
}
