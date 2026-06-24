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
 * the permission gate; it never decides what a scan means — it hands the raw string
 * up and the detail state machine parses/compares it. The permission gate is never a
 * dead end (AC-6): not-yet-asked → “Allow camera” (prompt); permanently denied →
 * “Open Settings” (deep link), plus a cancel path. A `lock` ref debounces so the
 * camera fires `onScanned` once, not dozens of times per second.
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

  // Permission state still resolving — render nothing rather than flashing the gate.
  if (!permission) {
    return <Screen testID="deliveries-scanner-loading" />;
  }

  if (!permission.granted) {
    const permanentlyDenied = !permission.canAskAgain;
    return (
      <Screen testID="deliveries-scanner-permission">
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <AppText variant="title">Accès caméra requis</AppText>
          <AppText variant="caption" className="text-center">
            Linky Driver utilise la caméra pour scanner le QR de la commande du client et confirmer
            la livraison.
          </AppText>
          {permanentlyDenied ? (
            <Button
              testID="deliveries-scanner-settings"
              label="Ouvrir les réglages"
              onPress={() => void Linking.openSettings()}
            />
          ) : (
            <Button
              testID="deliveries-scanner-enable"
              label="Autoriser la caméra"
              onPress={() => void requestPermission()}
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
        <View className="absolute inset-x-0 bottom-0 gap-3 bg-surface/95 p-5">
          <AppText variant="caption" className="text-center">
            Pointe la caméra vers le QR de la commande du client.
          </AppText>
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
