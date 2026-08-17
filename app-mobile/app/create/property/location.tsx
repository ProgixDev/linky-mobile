import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Mapbox, { MapView, Camera, PointAnnotation, type ScreenPointPayload } from '@rnmapbox/maps';
import type { Feature, Point } from 'geojson';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { ProgressDots } from '../../../src/components/primitives/ProgressDots';
import { TopBar } from '../../../src/components/nav/TopBar';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { I } from '../../../src/icons/Icon';
import { useToast } from '../../../src/components/feedback/Toast';
import { useCreateListing } from '../../../src/stores/createListing';
import { haptic } from '../../../src/lib/haptics';

// Idempotent — same init as CityMapPicker / PropertyLocationMap.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? null);

const CONAKRY: [number, number] = [-13.5784, 9.6412]; // [lng, lat]

export default function CreatePropertyLocationRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { show } = useToast();
  const lat = useCreateListing((s) => s.lat);
  const lng = useCreateListing((s) => s.lng);
  const setVal = useCreateListing((s) => s.set);
  const propertyType = useCreateListing((s) => s.propertyType);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<Camera>(null);

  // Phase R.2 — tap the real map to drop the pin. Mapbox onPress delivers a
  // GeoJSON Point ; coordinates can be 3D, so both values are runtime-checked.
  function handleMapPress(feature: Feature<Point, ScreenPointPayload>) {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) return;
    const tappedLng = coords[0];
    const tappedLat = coords[1];
    if (typeof tappedLng !== 'number' || typeof tappedLat !== 'number') return;
    haptic.selection();
    setVal('lat', tappedLat);
    setVal('lng', tappedLng);
  }

  // Recenter when coords change from ANY source (tap on map, GPS).
  useEffect(() => {
    if (lat == null || lng == null || !cameraRef.current) return;
    cameraRef.current.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: 15,
      animationDuration: 500,
    });
  }, [lat, lng]);

  async function handleMyPosition() {
    if (busy) return;
    setBusy(true);
    try {
      // Lazy-load so the screen still renders on dev-clients that pre-date the expo-location
      // install. If the native module isn't bundled, the import throws and we toast-fail.
      const Location = await import('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        show(t('create.locationPermDenied'), 'danger');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setVal('lat', pos.coords.latitude);
      setVal('lng', pos.coords.longitude);
    } catch (e: unknown) {
      console.error('[location] error:', e);
      const msg = e instanceof Error
        && (/ExpoLocation/.test(e.message) || /is not a function/.test(e.message))
        ? t('create.locationGpsUnavailable')
        : t('create.locationGpsFailed');
      show(msg, 'danger');
    } finally {
      setBusy(false);
    }
  }

  const hasCoords = lat != null && lng != null;
  // Simple users don't read raw lat/lng (client 2026-08-03) — the pin ON the map
  // IS the confirmation. Show a plain-language status, not coordinates.
  const statusLabel = hasCoords ? t('create.locationPinSet') : t('create.locationNoPosition');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('create.locationTopbar')} back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        <ProgressDots total={6} current={4} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          {t('create.stepDotsWith', { current: 5, total: 6, label: t('create.stepLocationLabel') })}
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 4 }}>
          {t('create.locationStepTitle')}
        </Text>
        {/* Plain-language instruction — replaces the technical « saisir les
            coordonnées » path (client 2026-08-03). */}
        <Text variant="bodyM" tone="muted" style={{ marginBottom: 14 }}>
          {t('create.locationHelp')}
        </Text>

        <View style={{ aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bgSunken, position: 'relative' }}>
          {Platform.OS === 'web' ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <Text variant="caption" tone="muted" center style={{ letterSpacing: 0 }}>
                {t('create.locationWebUnsupported')}
              </Text>
            </View>
          ) : (
            <MapView
              style={{ flex: 1 }}
              styleURL="mapbox://styles/mapbox/streets-v12"
              compassEnabled={false}
              scaleBarEnabled={false}
              logoEnabled={false}
              attributionEnabled={false}
              onPress={handleMapPress}
            >
              <Camera
                ref={cameraRef}
                defaultSettings={{
                  centerCoordinate: hasCoords ? [lng!, lat!] : CONAKRY,
                  zoomLevel: hasCoords ? 15 : 11,
                }}
              />
              {hasCoords && (
                <PointAnnotation id="listing-pin" coordinate={[lng!, lat!]}>
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
          <View
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              paddingHorizontal: 10,
              paddingVertical: 5,
              backgroundColor: hasCoords ? colors.primary : 'rgba(255,255,255,0.92)',
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {hasCoords && <I.check size={12} color="#FFFFFF" />}
            <Text style={{ fontSize: 11, fontWeight: '700', color: hasCoords ? '#FFFFFF' : '#13251C' }}>{statusLabel}</Text>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <Button
            variant="secondary"
            label={busy ? t('create.locationMyPositionBusy') : t('create.locationMyPosition')}
            disabled={busy}
            onPress={handleMyPosition}
            leading={<I.pin size={14} color={colors.text} />}
          />
        </View>
      </View>

      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" label={t('create.back')} onPress={() => router.back()} />
        <Button
          label={t('create.continue')}
          style={{ flex: 1 }}
          disabled={lat == null || lng == null}
          onPress={() =>
            router.push(
              propertyType === 'terrain'
                ? '/create/property/photos'
                : '/create/property/amenities',
            )
          }
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
