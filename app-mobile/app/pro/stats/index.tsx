// Phase T.3 — real-lite stats. Pre-T3 this screen rendered fake bars / fake
// metrics (4 280 vues, +18 %, 2,4M GNF) and a leaderboard of mock products
// the seller doesn't own. Now: the seller's actual products, ranked by their
// REAL view_count, with a true total. No fake deltas, no chart, no fake
// revenue — only data we can prove.
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Eye } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { EmptyState, ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { formatGNF } from '../../../src/lib/format';
import { useMyShops } from '../../../src/data/queries/shops';
import { useProducts } from '../../../src/data/queries';

export default function StatsRoute() {
  const { colors } = useTheme();
  const myShops = useMyShops();
  const firstShopId = myShops.data?.[0]?.id;
  const products = useProducts({ shopId: firstShopId });

  // U.0-B1 — without the firstShopId gate, useProducts({}) hits the public
  // feed before myShops resolves and stats would briefly render the WHOLE
  // marketplace as "tes annonces".
  const isLoading = myShops.isLoading || (!!firstShopId && products.isLoading);
  const isError = myShops.isError || (!!firstShopId && products.isError);
  const shopReady = !myShops.isLoading && !!firstShopId;

  // The seller's full list — list-products defaults to 'recent', so we sort
  // client-side by view_count. V1 volumes per shop are small, no pagination
  // needed yet. Only computed once the shop id is resolved (B1 gate).
  const ranked = shopReady
    ? [...(products.data ?? [])].sort((a, b) => b.viewCount - a.viewCount)
    : [];
  const totalViews = ranked.reduce((s, p) => s + p.viewCount, 0);
  const activeCount = ranked.filter((p) => p.status === 'active').length;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title="Statistiques"
          subtitle="Tes annonces et leurs vues — données réelles."
        />

        {isError && (
          <View style={{ paddingVertical: 28 }}>
            <ErrorStateView
              onRetry={() => {
                myShops.refetch();
                products.refetch();
              }}
            />
          </View>
        )}

        {!isError && (
          <>
            {/* Top-of-screen summary, real numbers only. */}
            <View style={{ paddingHorizontal: 24 }}>
              <View
                style={{
                  padding: 20,
                  borderRadius: 22,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.textFaint,
                    letterSpacing: 0.5,
                  }}
                >
                  VUES TOTALES · TES ANNONCES
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 32,
                      fontWeight: '700',
                      color: colors.text,
                      fontVariant: ['tabular-nums'],
                      letterSpacing: -0.6,
                      lineHeight: 38,
                      includeFontPadding: false,
                    }}
                  >
                    {totalViews.toLocaleString('fr-FR')}
                  </Text>
                  <Eye size={18} color={colors.textMuted} strokeWidth={1.75} />
                </View>
                <Text
                  style={{
                    fontSize: 12.5,
                    color: colors.textMuted,
                    marginTop: 4,
                  }}
                >
                  {activeCount} annonce{activeCount > 1 ? 's' : ''} active
                  {activeCount > 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            {/* Ranked list */}
            <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.textFaint,
                  letterSpacing: 0.6,
                  marginLeft: 4,
                  marginBottom: 12,
                }}
              >
                VUES PAR ANNONCE
              </Text>

              {isLoading && (
                <Text style={{ fontSize: 13, color: colors.textMuted, marginLeft: 4 }}>
                  Chargement…
                </Text>
              )}

              {!isLoading && ranked.length === 0 && (
                <View style={{ paddingVertical: 28 }}>
                  <EmptyState
                    icon="package"
                    title="Pas encore d'annonce"
                    description="Publie un produit depuis ta boutique pour voir tes vues s'afficher ici."
                  />
                </View>
              )}

              <View style={{ gap: 10 }}>
                {ranked.map((p, idx) => (
                  <View
                    key={p.id}
                    style={{
                      padding: 12,
                      borderRadius: 18,
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      flexDirection: 'row',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        width: 22,
                        textAlign: 'center',
                        fontSize: 14,
                        fontWeight: '800',
                        color: colors.textFaint,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {idx + 1}
                    </Text>
                    <Image
                      source={p.photos[0]}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 10,
                        backgroundColor: colors.bgSunken,
                      }}
                      contentFit="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13.5,
                          fontWeight: '600',
                          color: colors.text,
                          letterSpacing: 0,
                          lineHeight: 17,
                          includeFontPadding: false,
                        }}
                        numberOfLines={1}
                      >
                        {p.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.textMuted,
                          marginTop: 3,
                          letterSpacing: 0,
                        }}
                      >
                        {formatGNF(p.priceGnf)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Eye size={12} color={colors.textMuted} strokeWidth={2} />
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: '700',
                          color: colors.text,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {p.viewCount}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
