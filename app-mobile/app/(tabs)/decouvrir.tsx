import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, View, useWindowDimensions } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { DiscoverCard, DiscoverEnd } from '../../src/components/discover/DiscoverCard';
import { useDiscoverInfinite, type DiscoverFilter } from '../../src/data/queries';
import { useProperty } from '../../src/data/queries/properties';
import { useHiddenListings } from '../../src/stores/hiddenListings';
import type { DiscoverItem } from '../../src/data/types';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { useAuth } from '../../src/stores/auth';
import { ProductCardSkeleton } from '../../src/components/primitives/Skeleton';

type FeedRow = { kind: 'item'; data: DiscoverItem; id: string } | { kind: 'end'; id: string };

export default function DecouvrirRoute() {
  const { colors, theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Live window height → the vertical pager fills the screen at any Android
  // screen-zoom / display-size setting (was a stale module Dimensions.get()).
  const { height: SH } = useWindowDimensions();
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

  // Ouverture sur une annonce precise, depuis la pastille « Visite video » de sa
  // fiche (client 2026-08-11). On ne cherche PAS l'annonce dans le fil : elle
  // peut se trouver a la page 5 de la pagination, ou nulle part si le fil est
  // filtre autrement. On la charge donc a part et on la place en tete — le seul
  // moyen fiable de garantir que le lien tombe toujours sur la bonne video.
  const focusParams = useLocalSearchParams<{ focusKind?: string; focusId?: string }>();
  const focusPropertyId = focusParams.focusKind === 'property' ? focusParams.focusId : undefined;
  const { data: focusProperty } = useProperty(focusPropertyId);
  const [activeIndex, setActiveIndex] = useState(0);
  // Focus-gate playback : the tab-navigator keeps this screen MOUNTED when the
  // user switches tabs (or pushes a detail screen over it), so activeIndex alone
  // never pauses the video — it kept playing (with sound) in the background
  // (client 2026-07-30). A card counts as "active" only while Découvrir is the
  // foreground screen ; leaving pauses every video, returning resumes the
  // visible one.
  const isFocused = useIsFocused();
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

  // « Pas intéressé / Masquer » : drop the listings the user hid from their feed
  // (client 2026-07-30). Applies to the initial load, pagination AND refetch.
  const hiddenKeys = useHiddenListings((s) => s.keys);
  const feedItems = items.filter((d) => !hiddenKeys.has(`${d.kind}:${d.item.id}`));
  // L'annonce ciblee passe devant, et est retiree du reste pour ne pas
  // apparaitre deux fois si le fil la contenait deja.
  const visibleItems: DiscoverItem[] = focusProperty
    ? [
        { kind: 'property', item: focusProperty },
        ...feedItems.filter((d) => !(d.kind === 'property' && d.item.id === focusProperty.id)),
      ]
    : feedItems;

  // Key on stable identity (kind + id), NOT the array index — hiding one listing
  // shifts every following index and would remount those cards (recreating the
  // video player + resetting state). kind+id is unique across the feed.
  const rows: FeedRow[] = visibleItems.map((d) => ({
    kind: 'item' as const,
    data: d,
    id: `${d.kind}-${d.item.id}`,
  }));
  // End-of-feed card only when truly nothing more to load.
  if (!isLoading && !hasNextPage) rows.push({ kind: 'end', id: 'end' });

  // If the user hid every loaded item but more pages exist, the list would be
  // empty with no way to trigger onEndReached — auto-load the next page so the
  // feed refills instead of dead-ending on a blank screen.
  useEffect(() => {
    if (!isLoading && visibleItems.length === 0 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [isLoading, visibleItems.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      const idx = viewableItems[0]?.index ?? 0;
      setActiveIndex(idx);
    },
    [],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.discoverBg }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
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
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {t('decouvrir.errorTitle')}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
            {t('decouvrir.errorSub')}
          </Text>
          {/* Non-block Button self-aligns flex-start → looked left-shifted under
              the centered text. Wrap in a centered row (same fix as EmptyState /
              the other empty states — client 2026-08-03). */}
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center' }}>
            <Button
              variant="primary"
              size="md"
              label={t('common.retry')}
              onPress={() => void refetch()}
            />
          </View>
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
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {t('decouvrir.emptyTitle')}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
            {t('decouvrir.emptySub')}
          </Text>
          {/* Non-block Button self-aligns flex-start → looked left-shifted under
              the centered text. Wrap in a centered row (same fix as EmptyState /
              the other empty states — client 2026-08-03). */}
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center' }}>
            <Button
              variant="primary"
              size="md"
              label={t('common.retry')}
              onPress={() => void refetch()}
            />
          </View>
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={rows}
          // Re-render the visible cards whenever the active item OR the screen's
          // focus changes, so `isActive` (which gates video playback) actually
          // reaches DiscoverCard. Without this FlashList memoises items and a
          // video could keep playing after a scroll or a tab switch.
          extraData={`${activeIndex}|${isFocused}`}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) =>
            item.kind === 'end' ? (
              <DiscoverEnd onRefresh={() => { void refetch(); listRef.current?.scrollToIndex({ index: 0, animated: true }); }} />
            ) : (
              <DiscoverCard data={item.data} isActive={index === activeIndex && isFocused} height={SH} />
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
