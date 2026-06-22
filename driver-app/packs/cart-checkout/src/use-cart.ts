import { useState } from 'react';

import { useCartStore } from './cart-store';
import { placeOrder } from './data/orders-repo';

/**
 * Cart actions + a checkout call. `checkout()` sends only product ids + quantities;
 * the server prices the order and returns its id (then hand that to payment).
 */
export function useCart() {
  const items = useCartStore((s) => s.items);
  const add = useCartStore((s) => s.add);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const lines = useCartStore((s) => s.lines);

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = async (): Promise<string | null> => {
    setError(null);
    const cartLines = lines();
    if (cartLines.length === 0) {
      setError('Your cart is empty.');
      return null;
    }
    setPlacing(true);
    const r = await placeOrder(cartLines);
    setPlacing(false);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    clear();
    return r.value; // order id — start payment with this
  };

  return { items, add, setQty, remove, clear, placing, error, checkout };
}
