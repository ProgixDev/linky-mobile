import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@/shared/lib/logger';

type TokenResult =
  | { ok: true; token: string; platform: 'ios' | 'android' }
  | { ok: false; reason: 'denied' | 'not-a-device' | 'error' };

/**
 * Ask for permission and resolve the Expo push token for this device.
 * Key-free: Expo issues the token. Never throws — returns a typed result so the
 * caller can render the right state.
 */
export async function getExpoPushToken(): Promise<TokenResult> {
  // Push tokens are not issued on simulators/emulators.
  if (!Device.isDevice) return { ok: false, reason: 'not-a-device' };

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    // Android requires a notification channel before tokens deliver.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data } = await Notifications.getExpoPushTokenAsync();
    return { ok: true, token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' };
  } catch (err) {
    logger.warn('push: token request failed', { err });
    return { ok: false, reason: 'error' };
  }
}

/** How notifications behave while the app is foregrounded. */
export function configureForegroundBehavior(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
