import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';

import { resolveDeepLinkPath, SAFE_FALLBACK_ROUTE } from '@/shared/lib/deep-link';
import {
  addPushTokenChangeListener,
  getPushPermissionStatus,
  registerPushToken,
  requestPushPermission,
} from '@/shared/lib/push';
import { appStorage } from '@/shared/lib/storage';

import { useNotificationsStore } from './store';

/** Shown at most once, only when permission is still undetermined. */
const RATIONALE_SHOWN_KEY = 'push-rationale-v1';

function deeplinkOf(
  notification: Notifications.Notification | null | undefined,
): string | undefined {
  const data = notification?.request?.content?.data as { deeplink?: unknown } | undefined;
  return typeof data?.deeplink === 'string' ? data.deeplink : undefined;
}

/** A short in-app rationale before the OS prompt (never on cold first launch). */
function showRationale(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Rester informé des livraisons',
      'Active les notifications pour être prévenu dès qu’une nouvelle course t’est assignée.',
      [
        { text: 'Plus tard', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Activer', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

async function ensureRegistered(): Promise<void> {
  const status = await getPushPermissionStatus();
  if (status === 'denied') return; // don't nag a user who said no
  if (status === 'undetermined') {
    const already = await appStorage.get(RATIONALE_SHOWN_KEY);
    if (!already) {
      await appStorage.set(RATIONALE_SHOWN_KEY, '1');
      const wants = await showRationale();
      if (!wants) return;
    }
    const granted = await requestPushPermission();
    if (!granted) return;
  }
  await registerPushToken();
}

/**
 * Wire push reception into the running app. Call ONCE from the root layout.
 *
 * - `enabled` should be true only for an authenticated + APPROVED livreur — that
 *   gates the permission prompt to a contextual moment, never the cold first launch.
 * - `onForegroundDelivery` is invoked when a delivery push arrives while the app is
 *   open, so the app layer can refresh the deliveries worklist (kept here, not in
 *   this feature, to respect module boundaries).
 *
 * Tap handling (foreground, background, and cold-start) is ALWAYS active so a push
 * opened from the lock screen deep-links correctly even before `enabled` flips.
 */
export function useNotificationObservers({
  enabled,
  onForegroundDelivery,
}: {
  enabled: boolean;
  onForegroundDelivery?: () => void;
}): void {
  const refreshNotifications = useNotificationsStore((s) => s.refresh);

  // Keep the app-layer callback in a ref so changing its identity doesn't tear down
  // and re-create the notification listeners on every render.
  const onForegroundDeliveryRef = useRef(onForegroundDelivery);
  onForegroundDeliveryRef.current = onForegroundDelivery;

  const navigateToDeeplink = useCallback((deeplink?: string) => {
    if (!deeplink) return;
    const safe = resolveDeepLinkPath(deeplink);
    if (safe !== SAFE_FALLBACK_ROUTE) router.push(safe as Href);
  }, []);

  // Listeners that must always run (taps work regardless of `enabled`).
  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener((n) => {
      void refreshNotifications();
      const category = (n.request.content.data as { category?: unknown } | undefined)?.category;
      if (category === 'order') onForegroundDeliveryRef.current?.();
    });
    const response = Notifications.addNotificationResponseReceivedListener((r) => {
      navigateToDeeplink(deeplinkOf(r.notification));
    });
    // Cold start: the app was launched by tapping a push.
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) navigateToDeeplink(deeplinkOf(r.notification));
    });
    return () => {
      received.remove();
      response.remove();
    };
  }, [navigateToDeeplink, refreshNotifications]);

  // Token registration — gated on an approved, signed-in courier.
  useEffect(() => {
    if (!enabled) return;
    void ensureRegistered();
    void refreshNotifications();

    // Re-register if Expo rotates the token (stale token = missed pushes).
    const tokenSub = addPushTokenChangeListener(() => void registerPushToken());
    // Re-assert liveness + refresh the inbox on each foreground.
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void registerPushToken();
        void refreshNotifications();
      }
    });
    return () => {
      tokenSub.remove();
      appSub.remove();
    };
  }, [enabled, refreshNotifications]);
}
