# Pack: cart-checkout

Ecommerce core: a persisted **cart** plus `products` / `orders` / `order_items` and a `place_order`
RPC that **prices the order server-side** — the client never sends a price. Ties into your payment
packs. Logic-first; UI is a placeholder. **Key-free.**

## What you get

- `cart-store.ts` — persisted Zustand cart holding only `{ productId: qty }` (no prices).
- `supabase/0010_orders.sql` — `products` (public catalog), `orders` + `order_items` (read-own, no
  client write), and `place_order(items)` — a SECURITY DEFINER RPC that looks up each product's real
  price, computes the total, and stamps the order to the caller.
- `data/orders-repo.ts` — `listProducts`, `placeOrder`, `listOrders`.
- `useCart()` — add/setQty/remove/clear + `checkout()` returning the new order id.
- `CartScreen` — **placeholder** cart.

## Install

```
/add-feature cart-checkout
# apply the migration, then:
supabase db reset && supabase test db
```

Flow:

```tsx
const { add, checkout } = useCart();
add(productId);
const orderId = await checkout();         // server prices it
if (orderId) startPayment(orderId);       // Stripe (web) / RevenueCat (native)
```

## Security — why totals are trustworthy

The cart and the client can't set prices. `place_order` reads `price_cents` from the `products` table
for every line and sums it; a tampered client payload (fake price, fake total) is ignored. Orders and
items have **no client write policy** — they're created only through the RPC, which stamps
`user_id = auth.uid()`. Mark an order `paid` only from your **payment webhook** (server-side), never
from the app. Pairs with `payments-stripe` (web) / `payments-revenuecat` (native) and
`ratings-reviews`.
