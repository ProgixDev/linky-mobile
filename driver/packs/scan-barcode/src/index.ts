/** Public API of the barcode-scan feature. */
export { ScanScreen } from './ui/scan-screen';
export { useBarcodeScanner } from './use-barcode-scanner';
export { useScanStore } from './store';
export { lookupProduct } from './data/openfoodfacts';
export { type Product, ProductSchema, type ScanResult } from './model/product';
