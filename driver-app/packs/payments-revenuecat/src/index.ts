/** Public API of the payments (RevenueCat) feature. */
export { configureRevenueCat, isRevenueCatConfigured } from './purchases';
export { getOfferings, purchase, restorePurchases, getEntitlement } from './purchase-service';
export { useEntitlement } from './use-entitlement';
export {
  type Entitlement,
  EntitlementSchema,
  NO_ENTITLEMENT,
  PREMIUM_ENTITLEMENT,
} from './model/entitlement';
export { PaywallScreen } from './ui/paywall';
