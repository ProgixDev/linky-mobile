import { useEffect, useRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
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
import { Sheet } from '../../../src/components/sheets/Sheet';
import { I } from '../../../src/icons/Icon';
import { useToast } from '../../../src/components/feedback/Toast';
import { useCreateListing } from '../../../src/stores/createListing';
import { haptic } from '../../../src/lib/haptics';

// Idempotent — same init as CityMapPicker / PropertyLocationMap.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? null);

const CONAKRY: [number, number] = [-13.5784, 9.6412]; // [lng, lat]

// Formats e.g. (9.5092, 'N', 'S') -> "9.5092° N"; negative latitudes flip to S.
function formatCoord(n: number, posLabel: string, negLabel: string): string {
  return `${Math.abs(n).toFixed(4)}° ${n >= 0 ? posLabel : negLabel}`;
}

export default function CreatePropertyLocationRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { show } = useToast();
  const lat = useCreateListing((s) => s.lat);
  const lng = useCreateListing((s) => s.lng);
  const setVal = useCreateListing((s) => s.set);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [latInput, setLatInput] = useState(lat != null ? String(lat) : '');
  const [lngInput, setLngInput] = useState(lng != null ? String(lng) : '');
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

  // Recenter when coords change from ANY source (tap, GPS, manual entry).
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
      // The dev client built before expo-location was installed leaves the native module
      // stubbed — calls throw either "Cannot find native module 'ExpoLocation'" at import
      // time, or a "is not a function" TypeError at call time. Both mean: rebuild needed.
      const msg = e instanceof Error
        && (/ExpoLocation/.test(e.message) || /is not a function/.test(e.message))
        ? t('create.locationGpsUnavailable')
        : t('create.locationGpsFailed');
      show(msg, 'danger');
    } finally {
      setBusy(false);
    }
  }

  function handleManualSave() {
    const la = parseFloat(latInput);
    const ln = parseFloat(lngInput);
    if (!Number.isFinite(la) || la < -90 || la > 90) {
      show(t('create.locationLatErr'), 'danger');
      return;
    }
    if (!Number.isFinite(ln) || ln < -180 || ln > 180) {
      show(t('create.locationLngErr'), 'danger');
      return;
    }
    setVal('lat', la);
    setVal('lng', ln);
    setManualOpen(false);
  }

  const hasCoords = lat != null && lng != null;
  const coordsLabel = hasCoords
    ? `${formatCoord(lat, 'N', 'S')} · ${formatCoord(lng, 'E', 'W')}`
    : t('create.locationNoPosition');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('create.locationTopbar')} back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        <ProgressDots total={6} current={4} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          {t('create.stepDotsWith', { current: 5, total: 6, label: t('create.stepLocationLabel') })}
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 16 }}>
          {t('create.locationStepTitle')}
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
              logoEnabled={true}
              attributionEnabled={true}
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
              backgroundColor: 'rgba(255,255,255,0.92)',
              borderRadius: 8,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#13251C', fontVariant: ['tabular-nums'] }}>{coordsLabel}</Text>
          </View>
        </View>

        <View style={{ marginTop: 14, flexDirection: 'row', gap: 8 }}>
          <Button
            variant="secondary"
            style={{ flex: 1 }}
            label={busy ? t('create.locationMyPositionBusy') : t('create.locationMyPosition')}
            disabled={busy}
            onPress={handleMyPosition}
            leading={<I.pin size={14} color={colors.text} />}
          />
          <Button
            variant="secondary"
            style={{ flex: 1 }}
            label={t('create.locationManualCta')}
            onPress={() => {
              setLatInput(lat != null ? String(lat) : '');
              setLngInput(lng != null ? String(lng) : '');
              setManualOpen(true);
            }}
            leading={<I.edit size={14} color={colors.text} />}
          />
        </View>
      </View>

      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" label={t('create.back')} onPress={() => router.back()} />
        <Button
          label={t('create.continue')}
          style={{ flex: 1 }}
          disabled={lat == null || lng == null}
          onPress={() => router.push('/create/property/photos')}
        />
      </StickyBottom>

      <Sheet open={manualOpen} onClose={() => setManualOpen(false)} title={t('create.locationSheetTitle')} snapPoints={['50%']}>
        <View style={{ padding: 16, gap: 14 }}>
          <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
            {t('create.locationSheetSub')}
          </Text>
          <View style={{ gap: 6 }}>
            <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {t('create.locationLat')}
            </Text>
            <TextInput
              value={latInput}
              onChangeText={setLatInput}
              keyboardType="numbers-and-punctuation"
              placeholder="9.5092"
              placeholderTextColor={colors.textFaint}
              style={{
                fontSize: 16,
                color: colors.text,
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                fontVariant: ['tabular-nums'],
              }}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {t('create.locationLng')}
            </Text>
            <TextInput
              value={lngInput}
              onChangeText={setLngInput}
              keyboardType="numbers-and-punctuation"
              placeholder="-13.7122"
              placeholderTextColor={colors.textFaint}
              style={{
                fontSize: 16,
                color: colors.text,
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                fontVariant: ['tabular-nums'],
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Button variant="secondary" label={t('create.locationCancel')} onPress={() => setManualOpen(false)} style={{ flex: 1 }} />
            <Button label={t('create.locationSave')} onPress={handleManualSave} style={{ flex: 1 }} />
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
