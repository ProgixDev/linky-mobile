import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';

import { logger } from '@/shared/lib/logger';

import { saveDeviceToken } from './data/token-repo';
import { PushDataSchema } from './model/notification';
import { configureForegroundBehavior, getExpoPushToken } from './services/push';

type Status = 'idle' | 'registering' | 'registered' | 'denied' | 'unavailable';

/**
 * Registers this device for push on mount, stores the token (RLS-scoped), and
 * routes taps to the deep-link path in the payload. Pass `onOpenRoute` to send
 * the user to the screen the push points at (validated through PushDataSchema).
 */
export function usePushNotifications(onOpenRoute?: (route: string) => void) {
  const [status, setStatus] = useState<Status>('idle');
  const onOpenRouteRef = useRef(onOpenRoute);
  onOpenRouteRef.current = onOpenRoute;

  useEffect(() => {
    let cancelled = false;
    configureForegroundBehavior();

    void (async () => {
      setStatus('registering');
      const result = await getExpoPushToken();
      if (cancelled) return;
      if (!result.ok) {
        setStatus(result.reason === 'denied' ? 'denied' : 'unavailable');
        return;
      }
      const saved = await saveDeviceToken(result.token, result.platform);
      if (cancelled) return;
      if (!saved.ok) logger.warn('push: token not saved', { error: saved.error });
      setStatus('registered');
    })();

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const parsed = PushDataSchema.safeParse(response.notification.request.content.data);
      if (parsed.success && parsed.data.route) onOpenRouteRef.current?.(parsed.data.route);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return { status };
}
