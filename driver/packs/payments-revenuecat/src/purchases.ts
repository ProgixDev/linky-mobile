import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

import { logger } from '@/shared/lib/logger';

/**
 * RevenueCat configuration. The SDK keys are PUBLIC (appl_… / goog_…) and safe on
 * device. If no key is present (dev), the SDK runs in Preview/sandbox mode and
 * mocks offerings — so the whole purchase flow is buildable with NO key. On
 * install, add these to `src/shared/lib/env.ts` to keep env access centralized.
 */
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let configured = false;

/**
 * Call once at app start (after sign-in, pass the Supabase user id so RevenueCat
 * and the server-side `subscriptions` row share the same app_user_id).
 */
export function configureRevenueCat(appUserId?: string): void {
  if (configured) {
    if (appUserId) void Purchases.logIn(appUserId);
    return;
  }

  const apiKey = Platform.select({ ios: IOS_KEY, android: ANDROID_KEY });
  if (!apiKey) {
    logger.warn(
      '[payments] No RevenueCat key set — running keyless (Preview/sandbox). Purchases are mocked.',
    );
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
  // With no apiKey, configure still works in Preview mode (returns mock data).
  Purchases.configure({ apiKey: apiKey ?? '', appUserID: appUserId ?? null });
  configured = true;
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}
