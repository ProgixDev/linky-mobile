// Phase O.4 — Expo push registration + tap routing.
//
// Registration runs on every app start while a user is signed in (and again
// when authUserId changes), so the backend upsert reassigns the device row
// after login or account switching. The token is cached in MMKV so logout
// can unregister it without re-asking Expo.
//
// iOS pushes stay inert until the client's Apple Developer account provides
// an APNS key (EAS credentials). Android standalone builds need the Firebase
// project + google-services.json uploaded to EAS credentials. Dev builds
// work with Expo push today.

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router, useRootNavigationState } from 'expo-router';
import { apiPost } from './api';
import { storage, STORAGE_KEYS } from './storage';
import { useAuth } from '../stores/auth';
import { usePrefs } from '../stores/prefs';

// Foreground display : show the banner even while the app is open. Sounds
// off — in-app realtime (messages) already surfaces the event; the banner
// is enough.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Simulators have no push transport — skip silently.
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  // Only prompt when the OS still allows it — never re-prompt after a denial.
  if (status !== 'granted' && existing.canAskAgain) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications Linky',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  return data;
}

// Register this device's Expo push token with the backend and cache it in
// MMKV. Best-effort : a failure must never disturb the caller. Shared by the
// app-start hook and the in-app Notifications toggle.
export async function registerPushToken(): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (!token) return;
    await apiPost({
      path: '/register-push-token',
      body: {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        device_label: Device.modelName ?? undefined,
      },
    });
    storage.set(STORAGE_KEYS.pushToken, token);
  } catch (e) {
    console.warn('[push] registration failed:', e);
  }
}

// Logout path. Best-effort with a hard 2.5s cap — logout must never hang on
// push state (the server treats an already-gone token as success anyway).
export async function unregisterPushToken(): Promise<void> {
  const token = storage.getString(STORAGE_KEYS.pushToken);
  if (!token) return;
  try {
    await Promise.race([
      apiPost({ path: '/unregister-push-token', body: { token } }),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch (e) {
    console.warn('[push] unregister failed:', e);
  } finally {
    storage.remove(STORAGE_KEYS.pushToken);
  }
}

export function usePushRegistration(): void {
  const authUserId = useAuth((s) => s.authUserId);
  // Phase pre-prod — boot registration must respect the user's stated
  // preference. Without this, the OS-level subscription drifts back to ON on
  // every cold start, even after the user turned the toggle off.
  const notifications = usePrefs((s) => s.notifications);

  useEffect(() => {
    if (!authUserId) return;
    if (!notifications) {
      // Pref is OFF — make sure no stale token lingers on the backend. The
      // toggle's own onChange already runs unregister when the user flips it,
      // but a clean cold-start path matters when the pref was disabled on a
      // previous session and never reconciled (e.g. crash mid-flip).
      void unregisterPushToken();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (!token || cancelled) return;
        await apiPost({
          path: '/register-push-token',
          body: {
            token,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            device_label: Device.modelName ?? undefined,
          },
        });
        // Re-check after the await : if the user logged out mid-flight,
        // caching now would leave a token unregisterPushToken already missed.
        if (cancelled) return;
        storage.set(STORAGE_KEYS.pushToken, token);
      } catch (e) {
        // Best-effort : a failed registration must never disturb app start.
        console.warn('[push] registration failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUserId, notifications]);
}

export function useNotificationTapRouting(): void {
  // Cold-start taps fire before the root navigator exists — gate everything
  // on navigation readiness so router.push never throws.
  const navState = useRootNavigationState();
  const navReady = !!navState?.key;
  const handledId = useRef<string | null>(null);
  // Phase U.4 — guard on auth. Pre-U4 a tap from a stale notification
  // received before the user signed in would push the deeplink over
  // onboarding into an authed route ; the first authed API call would
  // 401 and the user landed on a back-less blank view. Drop the
  // deeplink in that case (stashing-until-signin is V1.1).
  const isOnboarded = useAuth((s) => s.isOnboarded);
  const authUserId = useAuth((s) => s.authUserId);

  useEffect(() => {
    if (!navReady) return;

    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledId.current === id) return;
      handledId.current = id;
      // Authed routes only ; if the user isn't signed in, DROP the
      // deeplink rather than push it into a 401 loop.
      if (!isOnboarded || !authUserId) return;
      const deeplink = response.notification.request.content.data?.deeplink;
      if (typeof deeplink === 'string' && deeplink.startsWith('/')) {
        router.push(deeplink as never);
      }
    };

    void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [navReady, isOnboarded, authUserId]);
}
