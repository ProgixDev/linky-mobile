// Phase T.3 — real-lite stats. Pre-T3 this screen rendered fake bars / fake
// metrics (4 280 vues, +18 %, 2,4M GNF) and a leaderboard of mock products
// the seller doesn't own. Now: the seller's actual products, ranked by their
// REAL view_count, with a true total. No fake deltas, no chart, no fake
// revenue — only data we can prove.
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Eye } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { EmptyState, ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { formatGNF } from '../../../src/lib/format';
import { useMyShops } from '../../../src/data/queries/shops';
import { useProducts, useMyProperties } from '../../../src/data/queries';

type StatRow = {
  id: string;
  kind: 'product' | 'property';
  title: string;
  photo?: string;
  priceGnf: number;
  viewCount: number;
  status: string;
};

export default function StatsRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const myShops = useMyShops();
  const firstShopId = myShops.data?.[0]?.id;
  const products = useProducts({ shopId: firstShopId });
  const properties = useMyProperties();

  // Stats covers BOTH a seller's products and an agent's properties —
  // "Tes annonces" is every listing the user owns (a pure agent has no shop /
  // no products, so a products-only screen showed them an empty stats page).
  // Products need the shop id (U.0-B1 gate so useProducts({}) doesn't briefly
  // query the public feed) ; properties are owner-scoped already.
  const isLoading =
    myShops.isLoading || (!!firstShopId && products.isLoading) || properties.isLoading;
  const isError = myShops.isError || (!!firstShopId && products.isError) || properties.isError;

  const productRows: StatRow[] = (firstShopId ? products.data ?? [] : []).map((p) => ({
    id: p.id, kind: 'product', title: p.title, photo: p.photos[0], priceGnf: p.priceGnf, viewCount: p.viewCount, status: p.status,
  }));
  const propertyRows: StatRow[] = (properties.data ?? []).map((p) => ({
    id: p.id, kind: 'property', title: p.title, photo: p.photos[0], priceGnf: p.priceGnf, viewCount: p.viewCount, status: p.status,
  }));
  // Sort client-side by view_count ; V1 per-user volumes are small.
  const ranked = [...productRows, ...propertyRows].sort((a, b) => b.viewCount - a.viewCount);
  const totalViews = ranked.reduce((s, r) => s + r.viewCount, 0);
  const activeCount = ranked.filter((r) => r.status === 'active').length;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title={t('pro.statsTitle')}
          subtitle={t('pro.statsSubtitle')}
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
                  {t('pro.statsCardEyebrow')}
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
                  {t('pro.statsActive', { count: activeCount })}
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
                {t('pro.statsListEyebrow')}
              </Text>

              {isLoading && (
                <Text style={{ fontSize: 13, color: colors.textMuted, marginLeft: 4 }}>
                  {t('pro.statsLoading')}
                </Text>
              )}

              {!isLoading && ranked.length === 0 && (
                <View style={{ paddingVertical: 28 }}>
                  <EmptyState
                    icon="package"
                    title={t('pro.statsEmptyTitle')}
                    description={t('pro.statsEmptyBody')}
                  />
                </View>
              )}

              <View style={{ gap: 10 }}>
                {ranked.map((r, idx) => (
                  <View
                    key={`${r.kind}-${r.id}`}
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
                      source={r.photo}
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
                        {r.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.textMuted,
                          marginTop: 3,
                          letterSpacing: 0,
                        }}
                      >
                        {formatGNF(r.priceGnf)} · {r.kind === 'property' ? t('pro.statsKindProperty') : t('pro.statsKindProduct')}
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
                        {r.viewCount}
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
