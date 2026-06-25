import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useRef } from 'react';
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
 * Happy path: the courier taps « Autoriser la caméra » → the OS prompt fires →
 * granted → camera + QR scan-frame. This mirrors the PROVEN global Linky scanner
 * (app-mobile/app/scan), which requests the permission on a user tap rather than
 * auto-on-mount — the more reliable path for the native Android camera prompt. If
 * the permission is permanently denied, the fallback offers Open Settings (never a
 * dead end, AC-6). A `lock` ref debounces so `onScanned` fires once, not dozens/sec.
 */
export function QrScanner({ onScanned, onCancel }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const lock = useRef(false);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (lock.current) return;
      lock.current = true;
      onScanned(data);
    },
    [onScanned],
  );

  // Only the very first permission resolve is blank; once we know the status, an
  // undetermined OR denied permission shows the « Autoriser » screen (tap → OS popup).
  if (!permission) {
    return <Screen testID="deliveries-scanner-loading" />;
  }

  // Undetermined or refused → the permission screen: tap « Autoriser la caméra » to
  // fire the OS popup; if permanently denied, Open Settings.
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
