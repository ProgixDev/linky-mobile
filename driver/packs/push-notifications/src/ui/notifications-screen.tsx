import { View } from 'react-native';

import { AppText, Screen } from '@/shared/ui';

import { usePushNotifications } from '../use-push-notifications';

const COPY: Record<string, string> = {
  idle: 'Starting…',
  registering: 'Requesting permission…',
  registered: "You're set up for notifications.",
  denied: 'Notifications are off. Enable them in Settings to get updates.',
  unavailable: 'Push needs a real device and a dev/standalone build.',
};

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder that
 * proves registration end to end and shows the resulting state.
 */
export function NotificationsScreen({ onOpenRoute }: { onOpenRoute?: (route: string) => void }) {
  const { status } = usePushNotifications(onOpenRoute);
  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <AppText variant="display">Notifications</AppText>
        <AppText testID="push-status" variant="body">
          {COPY[status] ?? status}
        </AppText>
      </View>
    </Screen>
  );
}
