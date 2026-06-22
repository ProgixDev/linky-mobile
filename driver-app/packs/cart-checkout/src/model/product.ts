import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  price_cents: z.number().int(),
  currency: z.string(),
});
export type Product = z.infer<typeof ProductSchema>;

export const OrderSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'paid', 'cancelled', 'fulfilled']),
  total_cents: z.number().int(),
  currency: z.string(),
  created_at: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

/** What the cart sends to place_order — never includes a price. */
export type CartLine = { product_id: string; qty: number };
