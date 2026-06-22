import Purchases from 'react-native-purchases';
import { useCallback, useEffect, useState } from 'react';

import { type Entitlement, NO_ENTITLEMENT } from './model/entitlement';
import { getEntitlement } from './purchase-service';

/**
 * React hook: the user's current entitlement (live from RevenueCat). Gate UI with
 * `isPremium`. For access decisions that actually matter, check the server-owned
 * `subscriptions` table via RLS — never trust the client.
 */
export function useEntitlement() {
  const [entitlement, setEntitlement] = useState<Entitlement>(NO_ENTITLEMENT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setEntitlement(await getEntitlement());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const onUpdate = () => void refresh();
    Purchases.addCustomerInfoUpdateListener(onUpdate);
    return () => Purchases.removeCustomerInfoUpdateListener(onUpdate);
  }, [refresh]);

  return { entitlement, isPremium: entitlement.isActive, loading, refresh };
}
