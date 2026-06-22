import { type Product, type ScanResult } from '../model/product';

/**
 * OpenFoodFacts product lookup — a free, public, **key-free** API. Build the
 * whole scan flow with no account. Docs: https://world.openfoodfacts.org/data
 */
const BASE = 'https://world.openfoodfacts.org/api/v2';
const FIELDS = 'product_name,brands,image_front_url,nutriscore_grade,nutriments';

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalize(barcode: string, raw: Record<string, unknown>): Product {
  const n = (raw.nutriments ?? {}) as Record<string, unknown>;
  const grade = String(raw.nutriscore_grade ?? '').toLowerCase();
  return {
    barcode,
    name: (raw.product_name as string) || null,
    brand: ((raw.brands as string) || '').split(',')[0]?.trim() || null,
    imageUrl: (raw.image_front_url as string) || null,
    nutriScore: ['a', 'b', 'c', 'd', 'e'].includes(grade) ? (grade as Product['nutriScore']) : null,
    nutriments: {
      energyKcal: num(n['energy-kcal_100g']),
      proteins: num(n.proteins_100g),
      carbs: num(n.carbohydrates_100g),
      fat: num(n.fat_100g),
      sugars: num(n.sugars_100g),
    },
  };
}

/** Look up a product by barcode. Never throws — returns a typed ScanResult. */
export async function lookupProduct(barcode: string): Promise<ScanResult> {
  try {
    const res = await fetch(
      `${BASE}/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
      {
        headers: { 'User-Agent': 'expo-skeleton-scan-pack/1.0 (dev)' },
      },
    );
    if (!res.ok) return { status: 'error', barcode, message: 'Lookup failed. Try again.' };
    const json = (await res.json()) as { status?: number; product?: Record<string, unknown> };
    if (json.status === 1 && json.product) {
      return { status: 'found', product: normalize(barcode, json.product) };
    }
    return { status: 'not_found', barcode };
  } catch {
    return { status: 'error', barcode, message: 'No connection. Check your network.' };
  }
}
