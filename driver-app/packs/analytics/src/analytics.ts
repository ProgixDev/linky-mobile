import PostHog from 'posthog-react-native';

import { env } from '@/shared/lib/env';
import { logger } from '@/shared/lib/logger';

import { type AnalyticsEvents, type EventName, FORBIDDEN_PROPERTY_KEYS } from './model/events';

/**
 * A thin, typed wrapper over PostHog. Design goals:
 *  - No key in dev -> every call is a safe no-op (no crashes, no network).
 *  - ATT-free: we never collect IDFA/advertising id, so no App Tracking prompt.
 *  - Allow-list events only (see model/events.ts), with a PII guard on properties.
 */
let client: PostHog | null = null;

export function initAnalytics(): PostHog | null {
  if (client) return client;
  const key = env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) {
    logger.info('analytics: no key, running as no-op');
    return null;
  }
  client = new PostHog(key, {
    host: env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    // ATT-free: do not collect the advertising identifier.
    enableSessionReplay: false,
  });
  return client;
}

function scrub<T extends Record<string, unknown>>(props: T): T {
  const out = { ...props };
  for (const key of Object.keys(out)) {
    if (FORBIDDEN_PROPERTY_KEYS.some((f) => key.toLowerCase().includes(f))) {
      delete out[key];
      logger.warn('analytics: dropped forbidden property', { key });
    }
  }
  return out;
}

/** Fire a typed event. No-ops if analytics isn't configured. */
export function capture<E extends EventName>(event: E, properties: AnalyticsEvents[E]): void {
  client?.capture(event, scrub(properties as Record<string, unknown>));
}

/** Associate events with a user (use the auth uid — never an email). */
export function identify(userId: string): void {
  client?.identify(userId);
}

/** Clear identity on sign-out. */
export function resetAnalytics(): void {
  client?.reset();
}
