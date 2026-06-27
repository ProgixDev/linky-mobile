import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef } from 'react';
import { Linking, View } from 'react-native';

import { AppText, Button, Screen } from '@/shared/ui';

interface QrScannerProps {
  /** Called once with the raw scanned string. Parsing/validation lives upstream. */
  onScanned: (raw: string) => void;
  /** Back out of the scanner without scanning. */
  onCancel: () => void;
}

/**
 * QR scanner for the handoff (spec 002, ADR-0009). Owns only the camera surface +
 * the permission gate; it hands the raw string up and the detail state machine
 * parses/compares it.
 *
 * Happy path = ASK → camera: on open, an `undetermined` permission triggers the OS
 * prompt directly (« ça ouvre directement », never a settings screen first). granted →
 * camera + QR scan-frame. Only AFTER the courier refuses do we show the « Accès caméra
 * requis » fallback (re-ask if still askable, else Open Settings) + a cancel path
 * (AC-6, never a dead end). A `lock` ref debounces so `onScanned` fires once, not many/sec.
 */
export function QrScanner({ onScanned, onCancel }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const lock = useRef(false);
  const asked = useRef(false);

  // As soon as we know the permission is undetermined, ask the OS directly so the
  // NATIVE prompt is the first thing shown (the owner wants it to open directly).
  // Guarded so it fires exactly once; a refusal then falls through to the fallback.
  useEffect(() => {
    if (permission?.status === 'undetermined' && !asked.current) {
      asked.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (lock.current) return;
      lock.current = true;
      onScanned(data);
    },
    [onScanned],
  );

  // Still resolving, or the OS prompt is in flight → loading (never flash the gate).
  if (!permission || permission.status === 'undetermined') {
    return <Screen testID="deliveries-scanner-loading" />;
  }

  // Refused → THEN the fallback: re-ask if still possible, otherwise Open Settings.
  if (!permission.granted) {
    return (
      <Screen testID="deliveries-scanner-permission">
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <AppText variant="title">Accès caméra requis</AppText>
          <AppText variant="caption" className="text-center">
            Linky Driver utilise la caméra pour scanner le QR de la commande du client et confirmer
            la livraison.
          </AppText>
          {permission.canAskAgain ? (
            <Button
              testID="deliveries-scanner-enable"
              label="Autoriser la caméra"
              onPress={() => void requestPermission()}
            />
          ) : (
            <Button
              testID="deliveries-scanner-settings"
              label="Ouvrir les réglages"
              onPress={() => void Linking.openSettings()}
            />
          )}
          <Button
            testID="deliveries-scanner-cancel"
            variant="ghost"
            label="Annuler"
            onPress={onCancel}
          />
        </View>
      </Screen>
    );
  }

  // Granted → camera + QR scan-frame overlay.
  return (
    <Screen padded={false} testID="deliveries-scanner">
      <View className="flex-1">
        {/* CameraView is third-party and not NativeWind-interop'd, so the fill is an
            inline style (the one sanctioned exception); chrome below uses className. */}
        <CameraView
          testID="deliveries-scanner-camera"
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarcode}
        />

        {/* Centered scan-frame: a square viewfinder with corner brackets + a hint. */}
        <View
          testID="deliveries-scanner-frame"
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <View className="h-64 w-64">
            <View className="absolute left-0 top-0 h-9 w-9 rounded-tl-2xl border-l-4 border-t-4 border-surface" />
            <View className="absolute right-0 top-0 h-9 w-9 rounded-tr-2xl border-r-4 border-t-4 border-surface" />
            <View className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-2xl border-b-4 border-l-4 border-surface" />
            <View className="absolute bottom-0 right-0 h-9 w-9 rounded-br-2xl border-b-4 border-r-4 border-surface" />
          </View>
          <View className="mt-6 rounded-full bg-ink/70 px-4 py-2">
            <AppText variant="label" className="text-ink-inverse">
              Scanne le QR du client
            </AppText>
          </View>
        </View>

        <View className="absolute inset-x-0 bottom-0 gap-3 bg-surface/95 p-5">
          <Button
            testID="deliveries-scanner-cancel"
            variant="ghost"
            label="Annuler"
            onPress={onCancel}
          />
        </View>
      </View>
    </Screen>
  );
}
