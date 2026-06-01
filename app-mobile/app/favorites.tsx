import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { useTheme } from '../src/theme/ThemeProvider';
import { Text } from '../src/components/primitives/Text';
import { ScreenHeader } from '../src/components/nav/ScreenHeader';
import { ProductCard } from '../src/components/lists/ProductCard';
import { PropertyCard } from '../src/components/lists/PropertyCard';
import { haptic } from '../src/lib/haptics';
import { useFavorites } from '../src/stores/favorites';
import { useProducts, useProperties } from '../src/data/queries';

type Tab = 'products' | 'properties';

export default function FavoritesRoute() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('products');
  const favProductIds = useFavorites((s) => s.productIds);
  const favPropertyIds = useFavorites((s) => s.propertyIds);

  // Pull from the live catalog and filter by fav ids. Cheap query: the user's
  // fav set is small, but the catalog list is bounded by /list-products' limit
  // (50 by default) so this handles the common case. For larger user fav sets,
  // V1.1 would add a server-side /list-favorites endpoint that joins fav ids.
  const { data: allProducts = [] } = useProducts();
  const { data: allProperties = [] } = useProperties();
  const favProducts = allProducts.filter((p) => favProductIds.has(p.id));
  const favProperties = allProperties.filter((p) => favPropertyIds.has(p.id));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title="Favoris"
          subtitle="Tes coups de cœur, sauvegardés pour plus tard."
        />

        {/* Tab switcher */}
        <View style={{ paddingHorizontal: 24, marginBottom: 18 }}>
          <View
            style={{
              flexDirection: 'row',
              gap: 6,
              padding: 4,
              borderRadius: 999,
              backgroundColor: colors.bgSunken,
            }}
          >
            <TabPill
              label={`Articles · ${favProducts.length}`}
              active={tab === 'products'}
              onPress={() => setTab('products')}
            />
            <TabPill
              label={`Logements · ${favProperties.length}`}
              active={tab === 'properties'}
              onPress={() => setTab('properties')}
            />
          </View>
        </View>

        {tab === 'products' ? (
          favProducts.length === 0 ? (
            <EmptyState
              title="Aucun favori"
              sub="Appuie sur le ❤ d'un article pour le retrouver ici."
              cta="Découvrir des articles"
              onPress={() => router.push('/(tabs)/marche')}
            />
          ) : (
            <View
              style={{
                paddingHorizontal: 24,
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              {favProducts.map((p) => (
                <View key={p.id} style={{ flexBasis: '47%', flexGrow: 1 }}>
                  <ProductCard product={p} />
                </View>
              ))}
            </View>
          )
        ) : favProperties.length === 0 ? (
          <EmptyState
            title="Aucun logement"
            sub="Appuie sur le ❤ d'un bien pour le retrouver ici."
            cta="Voir l'immobilier"
            onPress={() => router.push('/(tabs)/marche')}
          />
        ) : (
          <View style={{ paddingHorizontal: 24, gap: 14 }}>
            {favProperties.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TabPill({
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
        flex: 1,
        height: 38,
        borderRadius: 999,
        backgroundColor: active ? colors.bg : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: active ? colors.text : colors.textMuted,
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

function EmptyState({
  title,
  sub,
  cta,
  onPress,
}: {
  title: string;
  sub: string;
  cta: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 40, alignItems: 'center' }}>
      <View
        style={{
          width: 76,
          height: 76,
          borderRadius: 22,
          backgroundColor: colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Heart size={30} color={colors.textMuted} strokeWidth={1.75} />
      </View>
      <Text
        style={{
          fontSize: 17,
          fontWeight: '700',
          color: colors.text,
          marginTop: 18,
          letterSpacing: -0.2,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13.5,
          color: colors.textMuted,
          marginTop: 6,
          textAlign: 'center',
          maxWidth: 280,
          lineHeight: 19,
          letterSpacing: 0,
        }}
      >
        {sub}
      </Text>
      <Pressable
        onPress={onPress}
        style={{
          marginTop: 22,
          height: 48,
          paddingHorizontal: 22,
          borderRadius: 999,
          backgroundColor: colors.text,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: '700',
            color: colors.bg,
            lineHeight: 17,
            includeFontPadding: false,
          }}
        >
          {cta}
        </Text>
      </Pressable>
    </View>
  );
}
