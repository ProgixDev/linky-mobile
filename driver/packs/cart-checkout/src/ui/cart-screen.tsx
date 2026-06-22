import { FlatList, View } from 'react-native';

import { AppText, Button, Screen } from '@/shared/ui';

import { useCart } from '../use-cart';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder cart:
 * lists product ids + quantities and checks out (server prices the order).
 * Pass `onOrderPlaced` to start payment with the returned order id.
 */
export function CartScreen({ onOrderPlaced }: { onOrderPlaced?: (orderId: string) => void }) {
  const { items, setQty, remove, placing, error, checkout } = useCart();
  const entries = Object.entries(items);

  const onCheckout = async () => {
    const orderId = await checkout();
    if (orderId) onOrderPlaced?.(orderId);
  };

  return (
    <Screen>
      <View className="flex-1 gap-3">
        <AppText variant="display">Cart</AppText>
        <FlatList
          data={entries}
          className="flex-1"
          keyExtractor={([id]) => id}
          renderItem={({ item: [id, qty] }) => (
            <View className="flex-row items-center justify-between border-b border-ink-faint/10 py-3">
              <AppText variant="body">{id.slice(0, 8)}…</AppText>
              <View className="flex-row items-center gap-2">
                <Button label="-" variant="secondary" onPress={() => setQty(id, qty - 1)} />
                <AppText variant="body">{qty}</AppText>
                <Button label="+" variant="secondary" onPress={() => setQty(id, qty + 1)} />
                <Button label="Remove" variant="ghost" onPress={() => remove(id)} />
              </View>
            </View>
          )}
        />
        {error ? (
          <AppText variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}
        <Button
          label="Checkout"
          loading={placing}
          onPress={() => void onCheckout()}
        />
      </View>
    </Screen>
  );
}
