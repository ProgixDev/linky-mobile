import Purchases, { type PurchasesOffering, type PurchasesPackage } from 'react-native-purchases';

import { logger } from '@/shared/lib/logger';

import { type Entitlement, NO_ENTITLEMENT, PREMIUM_ENTITLEMENT } from './model/entitlement';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Map RevenueCat's customerInfo to our Entitlement shape. */
function toEntitlement(customerInfo: {
  entitlements: {
    active: Record<string, { productIdentifier: string; expirationDate: string | null }>;
  };
}): Entitlement {
  const active = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT];
  if (!active) return NO_ENTITLEMENT;
  return {
    isActive: true,
    identifier: PREMIUM_ENTITLEMENT,
    productId: active.productIdentifier,
    expiresAt: active.expirationDate,
    source: 'revenuecat',
  };
}

/** The current offering's purchasable packages (empty in keyless dev is fine). */
export async function getOfferings(): Promise<Result<PurchasesOffering | null>> {
  try {
    const offerings = await Purchases.getOfferings();
    return { ok: true, value: offerings.current ?? null };
  } catch (error) {
    logger.error('[payments] getOfferings failed', error);
    return { ok: false, error: 'Could not load plans. Please try again.' };
  }
}

/** Purchase a package. Returns the resulting entitlement. */
export async function purchase(pkg: PurchasesPackage): Promise<Result<Entitlement>> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { ok: true, value: toEntitlement(customerInfo) };
  } catch (error: unknown) {
    // RevenueCat sets userCancelled on the error when the user backs out.
    if (error && typeof error === 'object' && 'userCancelled' in error && error.userCancelled) {
      return { ok: false, error: 'cancelled' };
    }
    logger.error('[payments] purchase failed', error);
    return { ok: false, error: 'Purchase failed. You were not charged.' };
  }
}

/** Restore previous purchases (Apple requires a visible Restore action). */
export async function restorePurchases(): Promise<Result<Entitlement>> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { ok: true, value: toEntitlement(customerInfo) };
  } catch (error) {
    logger.error('[payments] restore failed', error);
    return { ok: false, error: 'Could not restore purchases.' };
  }
}

/** Read the current entitlement from RevenueCat (live client value). */
export async function getEntitlement(): Promise<Entitlement> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return toEntitlement(customerInfo);
  } catch {
    return NO_ENTITLEMENT;
  }
}
