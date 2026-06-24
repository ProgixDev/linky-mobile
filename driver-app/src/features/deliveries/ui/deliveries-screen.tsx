import { useEffect, useMemo } from 'react';
import { AppState, FlatList, RefreshControl, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Screen, Skeleton } from '@/shared/ui';

import { selectActiveDeliveries, useDeliveriesStore } from '../model/store';
import { DeliveryRow } from './delivery-row';

function LoadingList() {
  return (
    <View className="gap-3 pt-2" testID="deliveries-loading">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="flex-row gap-3">
          <Skeleton className="h-14 w-14" />
          <View className="flex-1 gap-2 py-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-32" />
          </View>
        </Card>
      ))}
    </View>
  );
}

/**
 * The driver's home: their active assigned deliveries, newest first. Renders an
 * honest state for every case — loading, empty, error, and (on a failed refresh
 * with cache) the last-saved list flagged as possibly stale. See spec 001.
 */
export function DeliveriesScreen() {
  const items = useDeliveriesStore((s) => s.items);
  const status = useDeliveriesStore((s) => s.status);
  const load = useDeliveriesStore((s) => s.load);
  const refresh = useDeliveriesStore((s) => s.refresh);

  const active = useMemo(() => selectActiveDeliveries(items), [items]);

  // Initial load on mount — but only AFTER the persisted cache has rehydrated, so
  // an offline cold start shows the cached list (+ stale banner) instead of a full
  // skeleton/error (spec 001 AC-7/AC-8). Persist rehydration is asynchronous.
  useEffect(() => {
    if (useDeliveriesStore.persist.hasHydrated()) {
      void load();
      return;
    }
    return useDeliveriesStore.persist.onFinishHydration(() => void load());
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const showInitialLoading = status === 'loading' || (status === 'idle' && active.length === 0);
  const showError = status === 'error' && active.length === 0;
  const showStale = status === 'error' && active.length > 0;

  return (
    <Screen testID="deliveries-screen">
      <View className="gap-1 pb-4 pt-4">
        <AppText variant="display">Mes livraisons</AppText>
        <AppText variant="caption" testID="deliveries-count">
          {active.length === 0 ? 'Aucune livraison active' : `${active.length} en cours`}
        </AppText>
      </View>

      {showStale ? (
        <View
          className="mb-3 rounded-control bg-surface-muted px-3 py-2"
          testID="deliveries-stale-banner"
        >
          <AppText variant="caption">
            Liste enregistrée affichée — actualisation impossible.
          </AppText>
        </View>
      ) : null}

      {showInitialLoading ? (
        <LoadingList />
      ) : showError ? (
        <EmptyState
          testID="deliveries-error"
          title="Impossible de charger tes livraisons"
          description="Vérifie ta connexion et réessaie."
          action={
            <Button testID="deliveries-retry" label="Réessayer" onPress={() => void load()} />
          }
        />
      ) : (
        <FlatList
          data={active}
          keyExtractor={(d) => d.id}
          renderItem={({ item, index }) => <DeliveryRow delivery={item} index={index} />}
          refreshControl={
            <RefreshControl refreshing={status === 'refreshing'} onRefresh={() => void refresh()} />
          }
          ListEmptyComponent={
            <EmptyState
              testID="deliveries-empty"
              title="Aucune livraison assignée pour l’instant"
              description="Les nouvelles courses apparaîtront ici dès qu’elles te seront assignées."
            />
          }
          contentContainerClassName="grow pb-8"
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
