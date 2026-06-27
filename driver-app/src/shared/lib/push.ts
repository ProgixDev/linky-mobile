/**
 * Device push-token plumbing for the Linky DRIVER app.
 *
 * This is INFRA (like `session`/`api`), not feature UI — it lives in shared so
 * the auth feature can `unregisterPushToken()` on sign-out BEFORE it clears the
 * session (the unregister call is authed; once the token is gone it would 401).
 * The notifications FEATURE owns the inbox + the permission/observer UX.
 *
 * The backend push infra is shared with the marketplace app (`push_tokens`,
 * `register-push-token`, `notify()`); a livreur who is also a marketplace user
 * has tokens for BOTH apps under one user_id, so we ALWAYS register with
 * app:'driver' and the assignment push targets app:'driver' only.
 *
 * Everything here is best-effort: a push failure must never break sign-in,
 * sign-out, or any business action. All errors are logged (redacted) and swallowed.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiPost } from './api';
import { logger } from './logger';
import { appStorage } from './storage';

/** Android channel for new-delivery pushes (created at runtime, high importance). */
export const DELIVERY_CHANNEL_ID = 'deliveries';

/** The last Expo push token we registered — kept so sign-out can unregister it. */
const PUSH_TOKEN_KEY = 'push-token-v1';

/** This app's value for push_tokens.app (keeps livreur pushes off the marketplace app). */
const APP_KIND = 'driver' as const;

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

function normalizeStatus(status: string | undefined): PermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/** The EAS project id — required for getExpoPushTokenAsync in a standalone build. */
function projectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  return fromExtra ?? Constants.easConfig?.projectId;
}

/**
 * Configure how a push is presented while the app is FOREGROUNDED. Call once at
 * startup (module side-effect in the root layout). Banner + list + sound + badge —
 * the courier should never miss a new delivery because the app happened to be open.
 */
export function configureForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/** Create the Linky-green, high-importance "Livraisons" channel (Android only). */
export async function ensureDeliveryChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(DELIVERY_CHANNEL_ID, {
      name: 'Livraisons',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#0E6E55', // Linky green
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (e) {
    logger.warn('[push] ensureDeliveryChannel failed', e);
  }
}

/** Current OS push-permission status (does NOT prompt). */
export async function getPushPermissionStatus(): Promise<PermissionStatus> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return normalizeStatus(status);
  } catch {
    return 'undetermined';
  }
}

/** Prompt for push permission. Returns true only if granted. */
export async function requestPushPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return normalizeStatus(status) === 'granted';
  } catch (e) {
    logger.warn('[push] requestPushPermission failed', e);
    return false;
  }
}

/**
 * Get this device's Expo push token and register it with the backend as a DRIVER
 * token. Assumes permission is already granted (the observer gates the prompt).
 * Idempotent — safe to call on every foreground; the backend upserts on token.
 * Returns the token, or null on any failure (best-effort).
 */
export async function registerPushToken(): Promise<string | null> {
  try {
    await ensureDeliveryChannel();

    const id = projectId();
    if (!id) {
      logger.warn('[push] no EAS projectId — cannot fetch an Expo push token');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return null;

    await apiPost({
      path: '/register-push-token',
      body: {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        device_label: Platform.OS === 'ios' ? 'iOS' : 'Android',
        app: APP_KIND,
      },
    });
    await appStorage.set(PUSH_TOKEN_KEY, token);
    return token;
  } catch (e) {
    logger.warn('[push] registerPushToken failed', e);
    return null;
  }
}

/**
 * Unregister this device's token on sign-out so a signed-out courier stops
 * receiving pushes. MUST run BEFORE `session.clear()` (the endpoint is authed).
 * Best-effort: the server also self-heals dead tokens and reassigns the row when
 * another account signs in on this device, so a failure here is not fatal.
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await appStorage.get(PUSH_TOKEN_KEY);
    if (token) {
      await apiPost({ path: '/unregister-push-token', body: { token } });
    }
  } catch (e) {
    logger.warn('[push] unregisterPushToken failed', e);
  } finally {
    await appStorage.remove(PUSH_TOKEN_KEY);
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch {
      // ignore — badge clearing is cosmetic
    }
  }
}

/**
 * Re-register when Expo rotates the token (rare, but a stale token = missed
 * pushes). Returns a subscription the caller removes on unmount.
 */
export function addPushTokenChangeListener(onChange: () => void): { remove: () => void } {
  return Notifications.addPushTokenListener(() => onChange());
}

/** Set the app icon badge to the unread count (best-effort, cosmetic). */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // ignore
  }
}

/**
 * Show a LOCAL notification immediately — NO push service / FCM required. The
 * foreground delivery poller calls this so a newly-assigned course pops as a system
 * banner WITHOUT Firebase. It fires while the app is alive (the foreground handler
 * presents it as a banner + sound); a fully-killed app still can't be woken without
 * FCM — an Android platform rule no backend can bypass. `data.deeplink` lets a tap
 * open the delivery via the same response listener that handles real pushes.
 */
export async function presentLocalNotification(input: {
  title: string;
  body: string;
  deeplink?: string | null;
  category?: string | null;
}): Promise<void> {
  try {
    await ensureDeliveryChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        sound: 'default',
        data: { deeplink: input.deeplink ?? null, category: input.category ?? null },
      },
      trigger: null, // immediate — the foreground handler presents it as a banner
    });
  } catch (e) {
    logger.warn('[push] presentLocalNotification failed', e);
  }
}
