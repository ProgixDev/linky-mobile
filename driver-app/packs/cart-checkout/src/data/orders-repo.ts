import { supabase } from '@/shared/lib/supabase';

import { OrderSchema, ProductSchema, type CartLine, type Order, type Product } from '../model/product';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** The active catalog (RLS: only active products are readable). */
export async function listProducts(): Promise<Result<Product[]>> {
  const { data, error } = await supabase
    .from('products')
    .select('id, title, price_cents, currency')
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data ?? []).map((p) => ProductSchema.parse(p)) };
}

/**
 * Place an order from cart lines. The server (place_order RPC) prices each line
 * from the products table and computes the total — the client price is never
 * trusted. Returns the new order id; start payment next.
 */
export async function placeOrder(lines: CartLine[]): Promise<Result<string>> {
  const { data, error } = await supabase.rpc('place_order', { items: lines });
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not place order.' };
  return { ok: true, value: data as string };
}

/** The current user's orders (RLS: own only). */
export async function listOrders(): Promise<Result<Order[]>> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, total_cents, currency, created_at')
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data ?? []).map((o) => OrderSchema.parse(o)) };
}
