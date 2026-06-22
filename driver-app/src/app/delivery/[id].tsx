import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AppText, Screen } from '@/shared/ui';

/**
 * Placeholder for the delivery detail / QR-handoff screen (a separate spec).
 * Exists so a tapped row from the deliveries list has a destination; the
 * handoff spec replaces this.
 */
export default function DeliveryDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen testID="delivery-detail-screen">
      <View className="gap-2 pt-4">
        <AppText variant="display">Delivery</AppText>
        <AppText variant="caption">Detail & handoff coming soon.</AppText>
        <AppText variant="caption" testID="delivery-detail-id">
          {id}
        </AppText>
      </View>
    </Screen>
  );
}
