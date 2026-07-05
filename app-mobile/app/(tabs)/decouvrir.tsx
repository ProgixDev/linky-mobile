import { useCallback, useRef, useState } from 'react';
import { Dimensions, Pressable, RefreshControl, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { DiscoverCard, DiscoverEnd } from '../../src/components/discover/DiscoverCard';
import { useDiscoverInfinite, type DiscoverFilter } from '../../src/data/queries';
import type { DiscoverItem } from '../../src/data/types';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { useAuth } from '../../src/stores/auth';
import { ProductCardSkeleton } from '../../src/components/primitives/Skeleton';

const { height: SH } = Dimensions.get('window');

type FeedRow = { kind: 'item'; data: DiscoverItem; id: string } | { kind: 'end'; id: string };

export default function DecouvrirRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const roles = useAuth((s) => s.roles);
  // Role-aware feed: pure agents see only properties, pure sellers see only products.
  const isBuyer = roles.includes('buyer');
  const isSeller = roles.includes('seller');
  const isAgent = roles.includes('agent');
  const isPureAgent = isAgent && !isSeller && !isBuyer;
  const isPureSeller = isSeller && !isAgent && !isBuyer;
  const isPurePro = isPureAgent || isPureSeller;
  // Manual filter (Tout / Produits / Immobilier) for everyone except pure pros,
  // who stay locked to their single kind. Overrides the role default.
  const [tab, setTab] = useState<DiscoverFilter>('all');
  const feedFilter: DiscoverFilter = isPureAgent ? 'properties' : isPureSeller ? 'products' : tab;

  const { items, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useDiscoverInfinite(feedFilter);
  const [activeIndex, setActiveIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlashListRef<FeedRow>>(null);

  // Phase U.0 should-fix — pull-to-refresh. Pre-U0 there was NO refresh
  // affordance until the feed was exhausted ; on the dark bg use a white
  // tint so the spinner is visible.
  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      listRef.current?.scrollToIndex({ index: 0, animated: false });
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

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
      ) : isError && items.length === 0 ? (
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
            {t('decouvrir.errorTitle')}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
            {t('decouvrir.errorSub')}
          </Text>
          <Button
            variant="primary"
            size="md"
            label={t('common.retry')}
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
            {t('decouvrir.emptyTitle')}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
            {t('decouvrir.emptySub')}
          </Text>
          <Button
            variant="primary"
            size="md"
            label={t('common.retry')}
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPullRefresh}
              tintColor="#FFFFFF"
            />
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={1.5}
        />
      )}

      {/* Manual filter tabs — overlay at the top, hidden for pure pros. */}
      {!isPurePro && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: insets.top + 10, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}
        >
          <View
            style={{
              flexDirection: 'row',
              gap: 4,
              padding: 4,
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.45)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
            }}
          >
            {([['all', 'filterAll'], ['products', 'filterProducts'], ['properties', 'filterProperties']] as const).map(
              ([val, key]) => {
                const on = tab === val;
                return (
                  <Pressable
                    key={val}
                    onPress={() => setTab(val)}
                    style={{
                      paddingHorizontal: 14,
                      height: 32,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? '#FFFFFF' : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? '#0E1311' : '#FFFFFF', letterSpacing: 0.1 }}>
                      {t(`decouvrir.${key}`)}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>
        </View>
      )}
    </View>
  );
}
