import { usePathname } from 'expo-router';
import { useEffect } from 'react';

import { useAnalytics } from './analytics-provider';

/**
 * Fires `screen_viewed` whenever the route changes. Drop it once near the root
 * (inside AnalyticsProvider) to get automatic screen analytics for every route.
 */
export function useScreenTracking(): void {
  const pathname = usePathname();
  const track = useAnalytics();
  useEffect(() => {
    if (pathname) track('screen_viewed', { screen: pathname });
  }, [pathname, track]);
}
