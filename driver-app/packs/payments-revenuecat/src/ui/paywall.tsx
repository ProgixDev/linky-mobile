import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { AppText, Button, Screen } from '@/shared/ui';

import { getOfferings, purchase, restorePurchases } from '../purchase-service';
import { useEntitlement } from '../use-entitlement';

/**
 * DESIGN: replace after the Claude Design pass. This is a FUNCTIONAL placeholder
 * paywall — it proves the logic (offerings → purchase → restore → entitlement)
 * works end to end. The real design drops onto these same hooks/services.
 */
export function PaywallScreen() {
  const { isPremium } = useEntitlement();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getOfferings().then((r) => {
      if (r.ok && r.value) setPackages(r.value.availablePackages);
    });
  }, []);

  if (isPremium) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <AppText variant="title">You’re Premium ✓</AppText>
        </View>
      </Screen>
    );
  }

  const buy = async (pkg: PurchasesPackage) => {
    setBusy(true);
    setError(null);
    const r = await purchase(pkg);
    setBusy(false);
    if (!r.ok && r.error !== 'cancelled') setError(r.error);
  };

  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <AppText variant="display">Go Premium</AppText>
        <AppText variant="caption">
          Unlock everything. (Placeholder paywall — replace after design.)
        </AppText>

        {packages.length === 0 ? (
          <AppText variant="caption" className="text-ink-muted">
            No plans loaded — keyless dev shows none. Add a RevenueCat key + an offering to see real
            packages.
          </AppText>
        ) : (
          packages.map((pkg) => (
            <Button
              key={pkg.identifier}
              testID={`paywall-buy-${pkg.identifier}`}
              loading={busy}
              label={`${pkg.product.title} — ${pkg.product.priceString}`}
              onPress={() => void buy(pkg)}
            />
          ))
        )}

        {error ? (
          <AppText testID="paywall-error" variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}

        <Button
          testID="paywall-restore"
          variant="ghost"
          label="Restore purchases"
          onPress={() => void restorePurchases()}
        />
      </View>
    </Screen>
  );
}
