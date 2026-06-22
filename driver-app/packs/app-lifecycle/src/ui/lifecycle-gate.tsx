import { Platform } from 'react-native';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { type ReactNode } from 'react';

import { AppText, Button, Screen } from '@/shared/ui';

import { useAppGate } from '../use-app-gate';

/**
 * DESIGN: replace the blocking screens after the Claude Design pass. Wrap your
 * routes: blocks the app on maintenance / update-required, soft-nudges on
 * update-available, and otherwise renders children.
 */
export function LifecycleGate({ children }: { children: ReactNode }) {
  const { status, config, loading } = useAppGate();

  if (loading) return <>{children}</>; // fail open while loading

  const openStore = () => {
    const url = Platform.OS === 'ios' ? config?.ios_store_url : config?.android_store_url;
    if (url) void Linking.openURL(url);
  };

  if (status === 'maintenance') {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 p-6">
          <AppText variant="display">We'll be right back</AppText>
          <AppText variant="body" className="text-center">
            {config?.maintenance_message ?? 'The app is under maintenance. Please try again soon.'}
          </AppText>
        </View>
      </Screen>
    );
  }

  if (status === 'update-required') {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 p-6">
          <AppText variant="display">Update required</AppText>
          <AppText variant="body" className="text-center">
            This version is no longer supported. Please update to continue.
          </AppText>
          <Button label="Update now" onPress={openStore} />
        </View>
      </Screen>
    );
  }

  // 'update-available' is a soft state — render the app; surface a banner yourself if desired.
  return <>{children}</>;
}
