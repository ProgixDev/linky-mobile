import { useEffect, useMemo, useState } from 'react';
import { AppState, FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { cn } from '@/shared/lib/cn';
import { AppText, Button, Card, EmptyState, Screen, Skeleton, TextField } from '@/shared/ui';

import { getDeadline, isSameDay, isUrgent } from '../lib/deadline';
import type { Delivery } from '../model/schema';
import { useDeliveriesStore } from '../model/store';
import { DeliveryRow } from './delivery-row';

type FilterKey = 'a_recuperer' | 'en_cours' | 'urgent' | 'aujourdhui' | 'terminees';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'a_recuperer', label: 'À récupérer' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'aujourdhui', label: 'Aujourd’hui' },
  { key: 'terminees', label: 'Terminées' },
];

const isActive = (d: Delivery) => d.status === 'assigned' || d.status === 'in_transit';

function applyFilter(items: Delivery[], key: FilterKey, now: number): Delivery[] {
  switch (key) {
    case 'a_recuperer':
      return items.filter((d) => d.status === 'assigned');
    case 'en_cours':
      return items.filter((d) => d.status === 'in_transit');
    case 'urgent':
      return items.filter((d) => isActive(d) && isUrgent(getDeadline(d), now));
    case 'aujourdhui':
      return items.filter((d) => isActive(d) && isSameDay(getDeadline(d), now));
    case 'terminees':
      return items.filter((d) => d.status === 'delivered');
  }
}

function matchesQuery(d: Delivery, q: string): boolean {
  return `${d.orderRef} ${d.itemTitle} ${d.dropoffCity} ${d.dropoffDistrict} ${d.shopName}`
    .toLowerCase()
    .includes(q);
}

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
 * The driver's home (Accueil): the worklist with intelligent quick-filters
 * (À récupérer / En cours / Urgent / Aujourd'hui / Terminées) + search, premium
 * cards, and a live deadline countdown per active delivery. Honest state for every
 * case — loading, empty, error, and (on a failed refresh with cache) the cached
 * list flagged as possibly stale. See spec 001.
 */
export function DeliveriesScreen() {
  const items = useDeliveriesStore((s) => s.items);
  const status = useDeliveriesStore((s) => s.status);
  const load = useDeliveriesStore((s) => s.load);
  const refresh = useDeliveriesStore((s) => s.refresh);

  const [filter, setFilter] = useState<FilterKey>('a_recuperer');
  const [query, setQuery] = useState('');

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

  const visible = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    let list = applyFilter(items, filter, now);
    if (q) list = list.filter((d) => matchesQuery(d, q));
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [items, filter, query]);

  const showInitialLoading = status === 'loading' || (status === 'idle' && items.length === 0);
  const showError = status === 'error' && items.length === 0;
  const showStale = status === 'error' && items.length > 0;

  return (
    <Screen testID="deliveries-screen">
      <View className="gap-1 pb-3 pt-4">
        <AppText variant="display">Mes livraisons</AppText>
        <AppText variant="caption" testID="deliveries-count">
          {visible.length === 0
            ? 'Aucune livraison'
            : `${visible.length} livraison${visible.length > 1 ? 's' : ''}`}
        </AppText>
      </View>

      <TextField
        testID="deliveries-search"
        className="mb-3 flex-none"
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher une livraison (réf, ville…)"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View className="mb-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pr-4"
        >
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                testID={`deliveries-filter-${f.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(f.key)}
                className={cn(
                  'rounded-full px-3.5 py-1.5',
                  on ? 'bg-brand-600' : 'bg-surface-muted',
                )}
              >
                <AppText
                  variant="caption"
                  className={cn('font-sans-medium', on ? 'text-ink-inverse' : 'text-ink-muted')}
                >
                  {f.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
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
          data={visible}
          keyExtractor={(d) => d.id}
          renderItem={({ item, index }) => <DeliveryRow delivery={item} index={index} />}
          refreshControl={
            <RefreshControl refreshing={status === 'refreshing'} onRefresh={() => void refresh()} />
          }
          ListEmptyComponent={
            <EmptyState
              testID="deliveries-empty"
              title="Aucune livraison dans ce filtre"
              description="Change de filtre, ou les nouvelles courses apparaîtront ici dès qu’elles te seront assignées."
            />
          }
          contentContainerClassName="grow pb-8"
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
