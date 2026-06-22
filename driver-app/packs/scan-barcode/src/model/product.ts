import { z } from 'zod';

/**
 * A food product, normalized from the OpenFoodFacts API (public, no key). We
 * validate at the edge because third-party JSON is untrusted and frequently
 * partial — missing fields degrade gracefully to null.
 */
export const ProductSchema = z.object({
  barcode: z.string().min(1),
  name: z.string().nullable(),
  brand: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  /** Nutri-Score grade a–e, if known. */
  nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).nullable(),
  /** Per-100g macros, if known. */
  nutriments: z.object({
    energyKcal: z.number().nullable(),
    proteins: z.number().nullable(),
    carbs: z.number().nullable(),
    fat: z.number().nullable(),
    sugars: z.number().nullable(),
  }),
});

export type Product = z.infer<typeof ProductSchema>;

export type ScanResult =
  | { status: 'found'; product: Product }
  | { status: 'not_found'; barcode: string }
  | { status: 'error'; barcode: string; message: string };
