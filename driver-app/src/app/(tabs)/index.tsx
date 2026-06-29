import { View } from 'react-native';

import { AvailabilityToggle } from '@/features/availability';
import { DeliveriesScreen } from '@/features/deliveries';
import { NotificationBell } from '@/features/notifications';

/**
 * Accueil (left tab) = the courier's deliveries worklist. Routes stay THIN. The
 * availability toggle + notifications bell are composed here (the app layer may
 * compose features; deliveries must not import them directly — module boundaries).
 */
export default function AccueilRoute() {
  return (
    <DeliveriesScreen
      headerRight={
        <View className="flex-row items-center gap-2">
          <AvailabilityToggle />
          <NotificationBell />
        </View>
      }
    />
  );
}
