import { CameraView } from 'expo-camera';
import { View } from 'react-native';

import { AppText, Button, Screen } from '@/shared/ui';

import { useBarcodeScanner } from '../use-barcode-scanner';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder scanner —
 * it proves the flow (camera → barcode → OpenFoodFacts lookup → result) end to end.
 */
export function ScanScreen() {
  const { permission, requestPermission, onScanned, result, loading, reset } = useBarcodeScanner();

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <AppText variant="title">Camera access needed</AppText>
          <AppText variant="caption" className="text-center">
            Scan a product barcode to look it up.
          </AppText>
          <Button
            testID="scan-allow"
            label="Allow camera"
            onPress={() => void requestPermission()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View className="flex-1">
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
          onBarcodeScanned={result ? undefined : ({ data }) => void onScanned(data)}
        />
        <View className="absolute inset-x-0 bottom-0 gap-2 bg-surface/95 p-5">
          {loading ? <AppText variant="body">Looking up…</AppText> : null}
          {result?.status === 'found' ? (
            <AppText variant="title">
              {result.product.name ?? 'Unknown product'}
              {result.product.nutriScore
                ? `  ·  Nutri-Score ${result.product.nutriScore.toUpperCase()}`
                : ''}
            </AppText>
          ) : null}
          {result?.status === 'not_found' ? (
            <AppText variant="body">Product not found ({result.barcode}).</AppText>
          ) : null}
          {result?.status === 'error' ? (
            <AppText variant="body" className="text-danger">
              {result.message}
            </AppText>
          ) : null}
          {result ? <Button testID="scan-again" label="Scan again" onPress={reset} /> : null}
        </View>
      </View>
    </Screen>
  );
}
