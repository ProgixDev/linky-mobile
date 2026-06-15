import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
  Pressable,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ShoppingBag,
  Home as HomeIcon,
  Telescope,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ProductCard } from '../../src/components/lists/ProductCard';
import { PropertyCard } from '../../src/components/lists/PropertyCard';
import { ProductCardSkeleton } from '../../src/components/primitives/Skeleton';
import { Sheet } from '../../src/components/sheets/Sheet';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { Switch } from '../../src/components/primitives/Switch';
import { Button } from '../../src/components/primitives/Button';
import { Chip } from '../../src/components/primitives/Chip';
import { ErrorStateView } from '../../src/components/feedback/EmptyState';
import { haptic } from '../../src/lib/haptics';
import { useFilters, hasActiveFilters } from '../../src/stores/filters';
import { useAuth } from '../../src/stores/auth';
import { useProductsInfinite, useInfiniteProperties } from '../../src/data/queries';
import { GUINEA_CITIES } from '../../src/components/onboarding/CityMapPicker';
import { haversineKm } from '../../src/lib/distance';

const PRODUCT_CATEGORIES = ['Tout', 'Mode', 'Électronique', 'Maison', 'Beauté', 'Auto'];
const PROPERTY_TYPES: { value: 'location' | 'vente' | 'terrain'; label: string }[] = [
  { value: 'location', label: 'Location' },
  { value: 'vente', label: 'Vente' },
  { value: 'terrain', label: 'Terrains' },
];

export default function MarcheRoute() {
  const { colors } = useTheme();
  const filters = useFilters();
  const roles = useAuth((s) => s.roles);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce the search input so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // One-shot user-location fetch for the distance-from-user badge. If permission
  // is denied or the sensor errors, we fall back to Conakry city center (between
  // Matam and Ratoma communes) so the distance badge still renders with realistic
  // km values for Guinean users — better than a missing badge.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const CONAKRY_FALLBACK = { lat: 9.5485, lng: -13.6770 };
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setUserLocation(CONAKRY_FALLBACK);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const { latitude, longitude } = pos.coords;
        if (latitude === 0 && longitude === 0) {
          setUserLocation(CONAKRY_FALLBACK);
          return;
        }
        setUserLocation({ lat: latitude, lng: longitude });
      } catch {
        if (!cancelled) setUserLocation(CONAKRY_FALLBACK);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tab visibility by role.
  // Pure agent → only Immobilier. Pure seller → only Articles. Everyone else → both.
  const isBuyer = roles.includes('buyer');
  const isSeller = roles.includes('seller');
  const isAgent = roles.includes('agent');
  const isPureAgent = isAgent && !isSeller && !isBuyer;
  const isPureSeller = isSeller && !isAgent && !isBuyer;
  const showArticles = !isPureAgent;
  const showImmobilier = !isPureSeller;
  const showSwitcher = showArticles && showImmobilier;

  // Force the marche tab to the only available section when role locks it.
  useEffect(() => {
    if (isPureAgent && filters.marcheTab !== 'immobilier') {
      filters.setMarcheTab('immobilier');
    } else if (isPureSeller && filters.marcheTab !== 'articles') {
      filters.setMarcheTab('articles');
    }
  }, [isPureAgent, isPureSeller, filters]);

  const productsQuery = useProductsInfinite({
    category: filters.productCategory === 'all' ? undefined : filters.productCategory,
    query: debouncedSearch || undefined,
    sort: filters.productSort,
  });
  const propertiesQuery = useInfiniteProperties({
    type: filters.propertyType,
    city: filters.city ?? undefined,
    rooms: filters.rooms,
    priceMaxGnf: filters.priceMaxGnf,
    distanceToRoadMaxM: filters.distanceToRoadMaxM,
    furnishedOnly: filters.furnishedOnly,
    query: debouncedSearch || undefined,
  });
  const products = productsQuery.products;
  const properties = propertiesQuery.properties;
  const prodLoading = productsQuery.isLoading;
  const propLoading = propertiesQuery.isLoading;

  // Effective tab: respects role locks even before useEffect syncs the store.
  const effectiveTab = isPureAgent
    ? 'immobilier'
    : isPureSeller
      ? 'articles'
      : filters.marcheTab;
  const isArticles = effectiveTab === 'articles';
  const placeholder = isArticles ? 'Cherche un produit…' : 'Quartier, type, surface…';
  const isPurePro = isPureAgent || isPureSeller;

  // Near-bottom trigger for fetchNextPage. 600px buffer = pre-fetch before the user
  // sees the end so the grid keeps growing as they scroll.
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (distanceFromBottom >= 600) return;
      const q = isArticles ? productsQuery : propertiesQuery;
      if (q.hasNextPage && !q.isFetchingNextPage) {
        void q.fetchNextPage();
      }
    },
    [isArticles, productsQuery, propertiesQuery],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        stickyHeaderIndices={[]}
        onScroll={handleScroll}
        scrollEventThrottle={300}
        refreshControl={
          <RefreshControl
            refreshing={(isArticles ? productsQuery.isFetching : propertiesQuery.isFetching) && !(isArticles ? productsQuery.isLoading : propertiesQuery.isLoading)}
            onRefresh={() => {
              void (isArticles ? productsQuery.refetch() : propertiesQuery.refetch());
            }}
            tintColor={colors.primary}
          />
        }
      >
        {/* ===== Header ===== */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <Text
            style={{
              fontSize: 32,
              fontWeight: '700',
              color: colors.text,
              letterSpacing: -0.5,
              lineHeight: 38,
            }}
          >
            {isPurePro ? 'Concurrence' : 'Marché'}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: colors.textMuted,
              marginTop: 4,
              letterSpacing: 0,
              lineHeight: 20,
            }}
          >
            {isPureSeller
              ? 'Scout les autres boutiques de ta catégorie.'
              : isPureAgent
                ? 'Surveille les autres biens à Conakry.'
                : isArticles
                  ? 'Découvre des milliers d\'articles.'
                  : 'Trouve ton prochain logement.'}
          </Text>
        </View>

        {/* Pro banner — only when user is pure pro */}
        {isPurePro && (
          <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 16,
                backgroundColor: colors.primarySoft,
                borderWidth: 1,
                borderColor: 'rgba(15,114,86,0.18)',
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Telescope size={18} color="#FFFFFF" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.primaryDeep,
                    letterSpacing: 0,
                    lineHeight: 16,
                    includeFontPadding: false,
                  }}
                >
                  Mode scout
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.primaryDeep,
                    marginTop: 2,
                    letterSpacing: 0,
                    lineHeight: 16,
                    opacity: 0.75,
                  }}
                >
                  {isPureSeller
                    ? 'Compare tes prix et idées avec les autres vendeurs.'
                    : 'Compare tes biens avec ceux du marché.'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ===== Tab pills (hidden when user is pure pro of one type) ===== */}
        {showSwitcher && (
          <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <TabPill
                Icon={ShoppingBag}
                label="Articles"
                active={isArticles}
                onPress={() => filters.setMarcheTab('articles')}
              />
              <TabPill
                Icon={HomeIcon}
                label="Immobilier"
                active={!isArticles}
                onPress={() => filters.setMarcheTab('immobilier')}
              />
            </View>
          </View>
        )}

        {/* ===== Search + filter ===== */}
        <View
          style={{
            paddingHorizontal: 24,
            marginTop: 16,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              flex: 1,
              height: 54,
              borderRadius: 999,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 18,
              paddingRight: 6,
            }}
          >
            <Search size={18} color={colors.textMuted} strokeWidth={2} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={placeholder}
              placeholderTextColor={colors.textFaint}
              style={{
                flex: 1,
                fontSize: 14.5,
                color: colors.text,
                letterSpacing: 0,
                marginLeft: 10,
                padding: 0,
              }}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Recherche"
            />
            {/* Camera "visual search" badge removed — it was a static View with
                no onPress, implying an image-search feature that doesn't exist. */}
          </View>
          <Pressable
            onPress={() => {
              haptic.light();
              setSheetOpen(true);
            }}
            accessibilityLabel="Filtres"
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              backgroundColor: colors.text,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SlidersHorizontal size={18} color={colors.bg} strokeWidth={2} />
          </Pressable>
        </View>

        {/* ===== Category chips ===== */}
        <View style={{ marginTop: 18 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 24,
              gap: 8,
              alignItems: 'center',
            }}
          >
            {isArticles
              ? PRODUCT_CATEGORIES.map((c) => {
                  const active =
                    filters.productCategory === 'all' ? c === 'Tout' : c === filters.productCategory;
                  return (
                    <CategoryPill
                      key={c}
                      label={c}
                      active={active}
                      onPress={() => filters.setProductCategory(c === 'Tout' ? 'all' : c)}
                    />
                  );
                })
              : PROPERTY_TYPES.map((t) => (
                  <CategoryPill
                    key={t.value}
                    label={t.label}
                    active={filters.propertyType === t.value}
                    onPress={() => filters.setPropertyType(t.value)}
                  />
                ))}
          </ScrollView>
        </View>

        {/* ===== Results header ===== */}
        <View
          style={{
            paddingHorizontal: 24,
            marginTop: 22,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Phase U.0 nit — pre-U0 the count rendered "0 résultats" above
              the error/loading view ; hide it (show "—") in those states. */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {(isArticles ? productsQuery.isError || productsQuery.isLoading : propertiesQuery.isError || propertiesQuery.isLoading)
                ? '—'
                : (isArticles ? products?.length : properties?.length) ?? 0}
            </Text>
            <Text style={{ fontSize: 13.5, color: colors.textMuted, letterSpacing: 0 }}>
              résultats
            </Text>
          </View>
          {/* Phase R.3 — the sort pill was decorative ; it now toggles
              récent ⇄ populaire (articles only ; properties sort server-side
              by recency). 'popular' is single-page by design. */}
          {isArticles && (
            <Pressable
              hitSlop={8}
              onPress={() => {
                haptic.selection();
                filters.setProductSort(filters.productSort === 'popular' ? 'recent' : 'popular');
              }}
              style={{
                flexDirection: 'row',
                gap: 6,
                alignItems: 'center',
                paddingHorizontal: 12,
                height: 32,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: filters.productSort === 'popular' ? colors.primary : colors.border,
                backgroundColor: filters.productSort === 'popular' ? colors.primarySoft : colors.card,
              }}
            >
              <ArrowUpDown
                size={13}
                color={filters.productSort === 'popular' ? colors.primaryDeep : colors.text}
                strokeWidth={2}
              />
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '600',
                  color: filters.productSort === 'popular' ? colors.primaryDeep : colors.text,
                  letterSpacing: 0,
                  lineHeight: 14,
                  includeFontPadding: false,
                }}
              >
                {filters.productSort === 'popular' ? 'Populaires' : 'Récents'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ===== Grid =====
            Phase T.4 — error + filters-empty CTAs. Pre-T4, a /list-products
            failure rendered like an empty grid (no affordance) and a
            filters-only-empty rendered a bare "Aucun résultat" line with no
            way to clear the filters that hid the inventory. */}
        {isArticles ? (
          productsQuery.isError ? (
            <View style={{ paddingTop: 40 }}>
              <ErrorStateView onRetry={() => void productsQuery.refetch()} />
            </View>
          ) : (
            <View
              style={{
                paddingHorizontal: 24,
                marginTop: 14,
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              {prodLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={{ flexBasis: '47%', flexGrow: 1 }}>
                    <ProductCardSkeleton />
                  </View>
                ))
              ) : products && products.length > 0 ? (
                products.map((p) => (
                  <View key={p.id} style={{ flexBasis: '47%', flexGrow: 1 }}>
                    <ProductCard product={p} />
                  </View>
                ))
              ) : debouncedSearch ? (
                <View style={{ width: '100%', paddingVertical: 40, alignItems: 'center' }}>
                  <Text tone="muted">Aucun résultat pour « {debouncedSearch} »</Text>
                </View>
              ) : hasActiveFilters(filters, true) ? (
                <View
                  style={{
                    width: '100%',
                    paddingVertical: 40,
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <Text tone="muted">Aucun résultat</Text>
                  <Button
                    variant="outline"
                    size="md"
                    label="Effacer les filtres"
                    onPress={() => {
                      filters.reset();
                      setSearch('');
                    }}
                  />
                </View>
              ) : (
                <View style={{ width: '100%', paddingVertical: 40, alignItems: 'center' }}>
                  <Text tone="muted">Aucune annonce pour le moment. Reviens bientôt.</Text>
                </View>
              )}
            </View>
          )
        ) : propertiesQuery.isError ? (
          <View style={{ paddingTop: 40 }}>
            <ErrorStateView onRetry={() => void propertiesQuery.refetch()} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 24, marginTop: 14, gap: 14 }}>
            {propLoading ? (
              Array.from({ length: 3 }).map((_, i) => <ProductCardSkeleton key={i} />)
            ) : properties && properties.length > 0 ? (
              properties.map((p) => {
                let dKm: number | undefined;
                if (
                  userLocation &&
                  p.gps &&
                  !(p.gps.lat === 0 && p.gps.lng === 0)
                ) {
                  dKm = haversineKm(userLocation, p.gps);
                }
                return <PropertyCard key={p.id} property={p} distanceFromUserKm={dKm} />;
              })
            ) : debouncedSearch ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Text tone="muted">Aucun résultat pour « {debouncedSearch} »</Text>
              </View>
            ) : hasActiveFilters(filters, false) ? (
              <View style={{ paddingVertical: 40, alignItems: 'center', gap: 14 }}>
                <Text tone="muted">Aucun résultat</Text>
                <Button
                  variant="outline"
                  size="md"
                  label="Effacer les filtres"
                  onPress={() => {
                    filters.reset();
                    setSearch('');
                  }}
                />
              </View>
            ) : (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Text tone="muted">Aucune annonce pour le moment. Reviens bientôt.</Text>
              </View>
            )}
          </View>
        )}

        {(isArticles ? productsQuery.isFetchingNextPage : propertiesQuery.isFetchingNextPage) && (
          <View style={{ paddingVertical: 18, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        )}
      </ScrollView>

      {/* ===== Filter sheet ===== */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filtres" snapPoints={['80%']}>
        <ScrollView style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <MicroLabel label="Type" />
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
            {PROPERTY_TYPES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                active={filters.propertyType === t.value}
                onPress={() => filters.setPropertyType(t.value)}
                block
              />
            ))}
          </View>

          <MicroLabel label="Prix max par mois" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {[
              { label: 'Tout', value: 0 },
              { label: '< 1M', value: 1_000_000 },
              { label: '< 2M', value: 2_000_000 },
              { label: '< 5M', value: 5_000_000 },
              { label: '< 10M', value: 10_000_000 },
            ].map((p) => (
              <Chip
                key={p.label}
                label={p.label}
                active={filters.priceMaxGnf === p.value}
                onPress={() => filters.setPriceRange(filters.priceMinGnf, p.value)}
              />
            ))}
          </View>

          <MicroLabel label="Ville" />
          {/* Phase R.3 — full 39-city list (was the 8 regional capitals only :
              a property saved with city='Ratoma' was unreachable via filter).
              Same list the onboarding + création wizards use. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {GUINEA_CITIES.map((c) => (
              <Chip
                key={c.name}
                label={c.name}
                active={filters.city === c.name}
                onPress={() => filters.setCity(filters.city === c.name ? null : c.name)}
              />
            ))}
          </View>

          <MicroLabel label="Pièces" />
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
            {['Studio', '1', '2', '3', '4+'].map((r) => {
              const value = r.toLowerCase();
              return (
                <Chip
                  key={r}
                  label={r}
                  active={filters.rooms === value}
                  onPress={() => filters.setRooms(filters.rooms === value ? null : value)}
                  block
                />
              );
            })}
          </View>

          <MicroLabel label="Distance max au goudron" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {[
              { label: 'Tout', value: 0 },
              { label: '< 250 m', value: 250 },
              { label: '< 500 m', value: 500 },
              { label: '< 1 km', value: 1000 },
              { label: '< 2 km', value: 2000 },
            ].map((d) => (
              <Chip
                key={d.label}
                label={d.label}
                active={filters.distanceToRoadMaxM === d.value}
                onPress={() => filters.setDistanceMax(d.value)}
              />
            ))}
          </View>

          <MicroLabel label="Meublé" />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 6,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '500' }}>Uniquement meublé</Text>
            <Switch value={filters.furnishedOnly} onChange={filters.setFurnishedOnly} />
          </View>
        </ScrollView>
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Button
            variant="secondary"
            label="Effacer"
            style={{ flex: 1 }}
            onPress={() => filters.reset()}
          />
          <Button
            variant="primary"
            // Phase Y.4 — pluralize the count noun (1 article, 2 articles).
            label={
              isArticles
                ? `Voir ${products?.length ?? 0} article${(products?.length ?? 0) === 1 ? '' : 's'}`
                : `Voir ${properties?.length ?? 0} bien${(properties?.length ?? 0) === 1 ? '' : 's'}`
            }
            style={{ flex: 2 }}
            onPress={() => setSheetOpen(false)}
          />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

// ---------- Subcomponents ----------

function TabPill({
  Icon,
  label,
  active,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={{
        flex: 1,
        height: 46,
        borderRadius: 999,
        backgroundColor: active ? colors.text : 'transparent',
        borderWidth: 1,
        borderColor: active ? colors.text : colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <Icon size={16} color={active ? colors.bg : colors.text} strokeWidth={1.75} />
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: active ? colors.bg : colors.text,
          letterSpacing: 0,
          lineHeight: 17,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CategoryPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={{
        height: 38,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: active ? colors.text : colors.card,
        borderWidth: 1,
        borderColor: active ? colors.text : colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 13.5,
          fontWeight: '600',
          color: active ? colors.bg : colors.text,
          letterSpacing: 0,
          lineHeight: 16,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
