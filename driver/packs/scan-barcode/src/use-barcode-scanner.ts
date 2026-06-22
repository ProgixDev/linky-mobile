import { useCameraPermissions } from 'expo-camera';
import { useCallback, useRef, useState } from 'react';

import { lookupProduct } from './data/openfoodfacts';
import { type ScanResult } from './model/product';
import { useScanStore } from './store';

/**
 * Barcode scanning logic: camera permission, a debounce lock so one barcode
 * isn't looked up dozens of times, the OpenFoodFacts lookup, and history. The UI
 * just renders the camera + this state.
 */
export function useBarcodeScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const lock = useRef(false);
  const addToHistory = useScanStore((s) => s.addToHistory);

  const onScanned = useCallback(
    async (barcode: string) => {
      if (lock.current || loading) return;
      lock.current = true;
      setLoading(true);
      const r = await lookupProduct(barcode);
      setResult(r);
      setLoading(false);
      if (r.status === 'found') {
        addToHistory({
          barcode: r.product.barcode,
          name: r.product.name,
          nutriScore: r.product.nutriScore,
          scannedAt: Date.now(),
        });
      }
    },
    [loading, addToHistory],
  );

  const reset = useCallback(() => {
    setResult(null);
    lock.current = false;
  }, []);

  return { permission, requestPermission, onScanned, result, loading, reset };
}
