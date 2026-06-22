import { createContext, useContext, useEffect, type ReactNode } from 'react';

import { capture, initAnalytics } from './analytics';
import { type AnalyticsEvents, type EventName } from './model/events';

type Track = <E extends EventName>(event: E, properties: AnalyticsEvents[E]) => void;

const AnalyticsContext = createContext<Track>(() => {});

/** Wrap the app once (in _layout.tsx). Initializes PostHog (no-op without a key). */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);
  return <AnalyticsContext.Provider value={capture}>{children}</AnalyticsContext.Provider>;
}

/** `const track = useAnalytics(); track('signed_in', { method: 'email' });` */
export function useAnalytics(): Track {
  return useContext(AnalyticsContext);
}
