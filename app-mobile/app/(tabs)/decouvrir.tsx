import { useCallback, useState } from 'react';
import { Dimensions, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../src/theme/ThemeProvider';
import { DiscoverCard, DiscoverEnd } from '../../src/components/discover/DiscoverCard';
import { useDiscoverInfinite } from '../../src/data/queries';
import type { DiscoverItem } from '../../src/data/types';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { useAuth } from '../../src/stores/auth';
import { ProductCardSkeleton } from '../../src/components/primitives/Skeleton';

const { height: SH } = Dimensions.get('window');

type FeedRow = { kind: 'item'; data: DiscoverItem; id: string } | { kind: 'end'; id: string };

export default function DecouvrirRoute() {
  const { colors } = useTheme();
  const roles = useAuth((s) => s.roles);
  // Role-aware feed: pure agents see only properties, pure sellers see only products.
  const isBuyer = roles.includes('buyer');
  const isSeller = roles.includes('seller');
  const isAgent = roles.includes('agent');
  const isPureAgent = isAgent && !isSeller && !isBuyer;
  const isPureSeller = isSeller && !isAgent && !isBuyer;
  const feedFilter = isPureAgent ? 'properties' : isPureSeller ? 'products' : 'all';

  const { items, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useDiscoverInfinite(feedFilter);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlashListRef<FeedRow>>(null);

  const rows: FeedRow[] = items.map((d, i) => ({
    kind: 'item' as const,
    data: d,
    id: `${d.kind}-${d.item.id}-${i}`,
  }));
  // End-of-feed card only when truly nothing more to load.
  if (!isLoading && !hasNextPage) rows.push({ kind: 'end', id: 'end' });

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      const idx = viewableItems[0]?.index ?? 0;
      setActiveIndex(idx);
    },
    [],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.discoverBg }}>
      <StatusBar style="light" />
      {/* Phase T.4 — distinct loading / error / empty states. Pre-T4 the
          loading was a bare text line and any failure rendered the
          end-of-feed card ("Tu as tout vu") immediately, which lies. */}
      {isLoading ? (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
            <ProductCardSkeleton />
            <ProductCardSkeleton />
          </View>
        </View>
      ) : isError ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            gap: 14,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
            Pas pu charger le feed
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
            Vérifie ta connexion et réessaie.
          </Text>
          <Button
            variant="primary"
            size="md"
            label="Réessayer"
            onPress={() => void refetch()}
          />
        </View>
      ) : items.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            gap: 12,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
            Rien à découvrir pour l'instant
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
            Reviens dans quelques minutes — le feed est mis à jour en continu.
          </Text>
          <Button
            variant="primary"
            size="md"
            label="Réessayer"
            onPress={() => void refetch()}
          />
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) =>
            item.kind === 'end' ? (
              <DiscoverEnd onRefresh={() => { void refetch(); listRef.current?.scrollToIndex({ index: 0, animated: true }); }} />
            ) : (
              <DiscoverCard data={item.data} isActive={index === activeIndex} height={SH} />
            )
          }
          pagingEnabled
          snapToInterval={SH}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
          onViewableItemsChanged={onViewableItemsChanged}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={1.5}
        />
      )}
    </View>
  );
}
