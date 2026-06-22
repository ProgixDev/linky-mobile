/**
 * The typed event catalog. Analytics is allow-list only: you can fire an event
 * only if it's declared here, and its properties are typed. This keeps the data
 * clean AND prevents accidentally shipping PII/secrets as event properties.
 *
 * Add new events here; never call capture() with a free-form string elsewhere.
 */
export type AnalyticsEvents = {
  screen_viewed: { screen: string };
  signed_up: { method: 'email' | 'phone' | 'oauth' };
  signed_in: { method: 'email' | 'phone' | 'oauth' };
  purchase_started: { product_id: string };
  purchase_completed: { product_id: string };
  item_created: { kind: string };
  search_performed: { has_results: boolean };
};

export type EventName = keyof AnalyticsEvents;

/** Property keys we refuse to send even if a caller tries — defense in depth. */
export const FORBIDDEN_PROPERTY_KEYS = [
  'email',
  'phone',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'session',
  'authorization',
  'ssn',
];
