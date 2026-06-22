import { z } from 'zod';

/**
 * Entitlement = does the user have access to a paid tier right now. The CLIENT
 * value (from RevenueCat) is convenient for gating UI; the SERVER value (the
 * `subscriptions` table, written by the verified webhook) is the source of truth
 * for anything that matters. Never trust the client for real access decisions.
 */
export const EntitlementSchema = z.object({
  isActive: z.boolean(),
  /** The active entitlement identifier (e.g. "premium"), if any. */
  identifier: z.string().nullable(),
  productId: z.string().nullable(),
  /** ISO timestamp when the current period ends, if known. */
  expiresAt: z.string().nullable(),
  /** Where this value came from. */
  source: z.enum(['revenuecat', 'server', 'none']),
});

export type Entitlement = z.infer<typeof EntitlementSchema>;

export const NO_ENTITLEMENT: Entitlement = {
  isActive: false,
  identifier: null,
  productId: null,
  expiresAt: null,
  source: 'none',
};

/** The entitlement id your app gates on. Rename per app. */
export const PREMIUM_ENTITLEMENT = 'premium';
