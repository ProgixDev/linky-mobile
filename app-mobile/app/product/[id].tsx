import { Dimensions, Pressable, ScrollView, Share, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Heart,
  Share2,
  ChevronRight,
  ShieldCheck,
  MapPin,
  Truck,
  Tag,
  Eye,
  Zap,
  MessageCircle,
  ShoppingBag,
  Star,
  Sparkles,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ProductCard } from '../../src/components/lists/ProductCard';
import { haptic } from '../../src/lib/haptics';
import { useProduct, useProducts, useToggleFavorite, useTrackView, useFindOrCreateConversation } from '../../src/data/queries';
import { useShop } from '../../src/data/queries/shops';
import { useFavorites } from '../../src/stores/favorites';
import { useCart } from '../../src/stores/cart';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { formatGNF, formatEUR } from '../../src/lib/format';
import { gnfToEur } from '../../src/lib/currency';
import { DetailStateScreen } from '../../src/components/feedback/DetailState';
import { useTranslation } from 'react-i18next';

const { width: SW } = Dimensions.get('window');

export default function ProductDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data: product, isLoading, isError, refetch } = useProduct(id);
  const { data: related } = useProducts({ category: product?.category });
  const isFav = useFavorites((s) => (id ? s.productIds.has(id) : false));
  const toggleFav = useFavorites((s) => s.toggleProduct);
  const toggleFavorite = useToggleFavorite();
  const trackView = useTrackView();

  // Fire-and-forget view bump on mount / when id changes. Failures don't block render.
  useEffect(() => {
    if (!id) return;
    trackView.mutate({ kind: 'product', id }, {
      onError: (e) => console.error('[view-track] product error:', e),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const addToCart = useCart((s) => s.add);
  const { show } = useToast();
  const [photoIdx, setPhotoIdx] = useState(0);
  const { data: shop } = useShop(product?.shopId);
  const findOrCreate = useFindOrCreateConversation();

  async function onChatPress() {
    if (!shop?.ownerId || !product?.id) return;
    haptic.light();
    try {
      const r = await findOrCreate.mutateAsync({
        recipient_id: shop.ownerId,
        pinned_kind: 'product',
        pinned_id: product.id,
      });
      router.push(`/messages/${r.conversation_id}`);
    } catch (e) {
      show(toToastMessage(e, "Impossible d'ouvrir la conversation"), 'danger');
    }
  }

  if (isLoading || isError || !product) {
    return <DetailStateScreen loading={isLoading} title={t('product.fallbackTitle')} onRetry={() => void refetch()} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* ===== Hero gallery ===== */}
        <View
          style={{
            aspectRatio: 1,
            position: 'relative',
            backgroundColor: '#0E1311',
          }}
        >
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
              if (idx !== photoIdx) setPhotoIdx(idx);
            }}
            scrollEventThrottle={16}
          >
            {product.photos.map((photo, i) => (
              <Image
                key={i}
                source={photo}
                style={{ width: SW, height: SW, backgroundColor: '#0E1311' }}
                contentFit="cover"
              />
            ))}
          </ScrollView>

          {/* Top action row */}
          <SafeAreaView
            edges={['top']}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              paddingHorizontal: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 8,
              }}
            >
              <CircleButton onPress={() => router.back()} ariaLabel="Retour">
                <ArrowLeft size={18} color="#0E1311" strokeWidth={2} />
              </CircleButton>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {/* Phase X.7 — native Share. Pre-X7 onPress was haptic-only.
                    Message-only : a `linky://` URL would dead-end for any
                    recipient without the app installed, and Android ignores
                    the url field anyway. Once a web/universal link exists
                    (V1.1), add a URL pointing at the public listing page. */}
                <CircleButton
                  onPress={() => {
                    haptic.light();
                    void Share.share({
                      title: product.title,
                      message: `${product.title} — ${formatGNF(product.priceGnf)} sur Linky`,
                    }).catch(() => {});
                  }}
                  ariaLabel="Partager"
                >
                  <Share2 size={16} color="#0E1311" strokeWidth={2} />
                </CircleButton>
                <CircleButton
                  onPress={() => {
                    haptic.light();
                    toggleFav(product.id);
                    toggleFavorite.mutate(product.id);
                  }}
                  ariaLabel={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <Heart
                    size={16}
                    color={isFav ? colors.danger : '#0E1311'}
                    fill={isFav ? colors.danger : 'transparent'}
                    strokeWidth={isFav ? 0 : 2}
                  />
                </CircleButton>
              </View>
            </View>
          </SafeAreaView>

          {/* Bottom: boost chip + carousel dots + image count */}
          <View
            style={{
              position: 'absolute',
              bottom: 14,
              left: 16,
              right: 16,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {product.boosted && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 9,
                    height: 24,
                    borderRadius: 999,
                    backgroundColor: colors.accent,
                  }}
                >
                  <Sparkles size={11} color="#2A1A05" strokeWidth={2.25} />
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontWeight: '700',
                      color: '#2A1A05',
                      lineHeight: 12,
                      includeFontPadding: false,
                      letterSpacing: 0.3,
                    }}
                  >
                    BOOSTÉE
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
              {product.photos.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === photoIdx ? 22 : 6,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: i === photoIdx ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
                  }}
                />
              ))}
            </View>
            <View
              style={{
                paddingHorizontal: 9,
                height: 24,
                borderRadius: 999,
                backgroundColor: 'rgba(0,0,0,0.5)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: '#FFFFFF',
                  fontVariant: ['tabular-nums'],
                  lineHeight: 13,
                  includeFontPadding: false,
                }}
              >
                {photoIdx + 1} / {product.photos.length}
              </Text>
            </View>
          </View>
        </View>

        {/* ===== Title block ===== */}
        <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
          {/* Condition + meta line */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              flexWrap: 'wrap',
            }}
          >
            <ConditionChip condition={product.condition} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Eye size={11} color={colors.textMuted} strokeWidth={2} />
              <Text
                style={{
                  fontSize: 11.5,
                  color: colors.textMuted,
                  letterSpacing: 0,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {product.viewCount} vues
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Heart size={11} color={colors.textMuted} strokeWidth={2} />
              <Text
                style={{
                  fontSize: 11.5,
                  color: colors.textMuted,
                  letterSpacing: 0,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {product.favCount} favoris
              </Text>
            </View>
          </View>

          <Text
            style={{
              fontSize: 24,
              fontWeight: '700',
              color: colors.text,
              letterSpacing: -0.3,
              lineHeight: 30,
            }}
          >
            {product.title}
          </Text>

          {/* Price */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 10,
              marginTop: 12,
            }}
          >
            <Text
              style={{
                fontSize: 30,
                fontWeight: '700',
                color: colors.text,
                fontVariant: ['tabular-nums'],
                letterSpacing: -0.6,
                lineHeight: 34,
                includeFontPadding: false,
              }}
            >
              {formatGNF(product.priceGnf).replace(' GNF', '')}
            </Text>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: colors.textMuted,
              }}
            >
              GNF
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textFaint,
                letterSpacing: 0,
              }}
            >
              {formatEUR(gnfToEur(product.priceGnf))}
            </Text>
          </View>
        </View>

        {/* ===== Trust strip ===== */}
        <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
          <View
            style={{
              padding: 14,
              borderRadius: 16,
              backgroundColor: colors.primarySoft,
              borderWidth: 1,
              borderColor: 'rgba(15,114,86,0.18)',
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 10,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={14} color="#FFFFFF" strokeWidth={2.25} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 13.5,
                  fontWeight: '700',
                  color: colors.primaryDeep,
                  letterSpacing: 0,
                  lineHeight: 17,
                  includeFontPadding: false,
                }}
              >
                Paiement sécurisé
              </Text>
              <Text
                style={{
                  fontSize: 12.5,
                  color: colors.primaryDeep,
                  marginTop: 2,
                  opacity: 0.78,
                  letterSpacing: 0,
                  lineHeight: 17,
                }}
              >
                Le vendeur n'est payé qu'après ta confirmation de réception.
              </Text>
            </View>
          </View>
        </View>

        {/* ===== Shop card ===== */}
        {shop && (
          <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
            <Pressable
              onPress={() => router.push(`/shop/${shop.id}`)}
              style={{
                padding: 14,
                borderRadius: 18,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <View style={{ position: 'relative' }}>
                <Image
                  source={shop.avatar}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    backgroundColor: colors.bgSunken,
                  }}
                  contentFit="cover"
                />
                {shop.verified && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      backgroundColor: colors.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2.5,
                      borderColor: colors.card,
                    }}
                  >
                    <ShieldCheck size={9} color="#FFFFFF" strokeWidth={3} />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14.5,
                    fontWeight: '700',
                    color: colors.text,
                    letterSpacing: 0,
                    lineHeight: 18,
                    includeFontPadding: false,
                  }}
                  numberOfLines={1}
                >
                  {shop.name}
                </Text>
                {/* Phase Y.4 — sweep: never render a 0-star rating or a bare
                    response-time placeholder. For new shops, show "Nouveau"
                    in lieu of the rating ; only append "repond en X" when a
                    real response_time value is present. */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 4,
                  }}
                >
                  {shop.reviewCount > 0 ? (
                    <>
                      <Star size={11} color={colors.accent} fill={colors.accent} />
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: '700',
                          color: colors.text,
                          fontVariant: ['tabular-nums'],
                          letterSpacing: 0,
                        }}
                      >
                        {shop.rating.toFixed(1)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11.5,
                          color: colors.textMuted,
                          letterSpacing: 0,
                        }}
                      >
                        ({shop.reviewCount} avis)
                        {shop.responseTime.trim().length > 0
                          ? ` · répond en ${shop.responseTime}`
                          : ''}
                      </Text>
                    </>
                  ) : (
                    <Text
                      style={{
                        fontSize: 11.5,
                        color: colors.textMuted,
                        letterSpacing: 0,
                      }}
                    >
                      Nouveau
                      {shop.responseTime.trim().length > 0
                        ? ` · répond en ${shop.responseTime}`
                        : ''}
                    </Text>
                  )}
                </View>
              </View>
              <ChevronRight size={16} color={colors.textFaint} strokeWidth={2} />
            </Pressable>
          </View>
        )}

        {/* ===== Specs ===== */}
        <Section title={t('product.specHeading')}>
          <View
            style={{
              borderRadius: 18,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}
          >
            <SpecRow Icon={Tag} label={t('product.specCategorie')} value={capitalize(product.category)} />
            <SpecRow
              Icon={ShieldCheck}
              label={t('product.specCondition')}
              value={conditionLabel(product.condition)}
            />
            <SpecRow
              Icon={MapPin}
              label={t('product.specPlace')}
              value={`${product.city}${product.district ? `, ${product.district}` : ''}`}
            />
            <SpecRow Icon={Truck} label={t('product.specShipping')} value={t('product.specShippingValue')} last />
          </View>
        </Section>

        {/* ===== Description ===== */}
        {/* Phase Y.4 — hide the heading entirely when no description, rather
            than showing "Description" above an empty paragraph. */}
        {product.description.trim().length > 0 && (
          <Section title={t('product.descriptionHeading')}>
            <Text
              style={{
                fontSize: 14.5,
                color: colors.text,
                lineHeight: 22,
                letterSpacing: 0,
              }}
            >
              {product.description}
            </Text>
          </Section>
        )}

        {/* ===== Related ===== */}
        {related && related.length > 1 && (
          <View style={{ paddingTop: 28 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: colors.text,
                letterSpacing: -0.2,
                paddingHorizontal: 24,
                marginBottom: 12,
              }}
            >
              Aussi consultés
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingHorizontal: 24 }}
            >
              {related
                .filter((r) => r.id !== product.id)
                .slice(0, 6)
                .map((r) => (
                  <View key={r.id} style={{ width: 160 }}>
                    <ProductCard product={r} compact />
                  </View>
                ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* ===== Sticky bottom action bar ===== */}
      <SafeAreaView
        edges={['bottom']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 6,
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={onChatPress}
            disabled={findOrCreate.isPending || !shop?.ownerId}
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: findOrCreate.isPending || !shop?.ownerId ? 0.5 : 1,
            }}
            accessibilityLabel="Contacter le vendeur"
          >
            <MessageCircle size={18} color={colors.text} strokeWidth={2} />
          </Pressable>

          <Pressable
            onPress={() => {
              haptic.light();
              addToCart(product.id);
              show('Ajouté au panier', 'success');
            }}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 999,
              backgroundColor: colors.primary,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <ShoppingBag size={16} color="#FFFFFF" strokeWidth={2.25} />
            <Text
              style={{
                fontSize: 14.5,
                fontWeight: '700',
                color: '#FFFFFF',
                letterSpacing: 0,
                lineHeight: 17,
                includeFontPadding: false,
              }}
              numberOfLines={1}
            >
              Ajouter au panier
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              haptic.medium();
              addToCart(product.id);
              router.push('/checkout');
            }}
            style={{
              height: 52,
              paddingHorizontal: 18,
              borderRadius: 999,
              backgroundColor: colors.accent,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
            accessibilityLabel="Acheter maintenant"
          >
            <Zap size={15} color="#2A1A05" strokeWidth={2.5} fill="#2A1A05" />
            <Text
              style={{
                fontSize: 13.5,
                fontWeight: '700',
                color: '#2A1A05',
                letterSpacing: 0,
                lineHeight: 16,
                includeFontPadding: false,
              }}
            >
              Acheter
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ===================================================================
// Subcomponents
// ===================================================================

function CircleButton({
  onPress,
  children,
  ariaLabel,
}: {
  onPress: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={ariaLabel}
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.95)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </Pressable>
  );
}

function ConditionChip({ condition }: { condition: 'neuf' | 'occasion' | 'reconditionné' }) {
  const { colors } = useTheme();
  const map: Record<typeof condition, { bg: string; fg: string; label: string }> = {
    neuf: { bg: colors.primarySoft, fg: colors.primaryDeep, label: 'Neuf' },
    occasion: { bg: colors.accentSoft, fg: colors.accentText, label: 'Occasion' },
    reconditionné: { bg: '#E4ECF6', fg: '#2F5BBE', label: 'Reconditionné' },
  };
  const m = map[condition];
  return (
    <View
      style={{
        paddingHorizontal: 10,
        height: 24,
        borderRadius: 999,
        backgroundColor: m.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 11.5,
          fontWeight: '700',
          color: m.fg,
          letterSpacing: 0.2,
          lineHeight: 14,
          includeFontPadding: false,
        }}
      >
        {m.label}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 24 }}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: '700',
          color: colors.text,
          letterSpacing: -0.2,
          marginBottom: 12,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function SpecRow({
  Icon,
  label,
  value,
  last,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          backgroundColor: colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={14} color={colors.text} strokeWidth={1.75} />
      </View>
      <Text
        style={{
          fontSize: 13.5,
          color: colors.textMuted,
          letterSpacing: 0,
          flex: 1,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 13.5,
          fontWeight: '600',
          color: colors.text,
          letterSpacing: 0,
          maxWidth: '55%',
          textAlign: 'right',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function conditionLabel(c: 'neuf' | 'occasion' | 'reconditionné'): string {
  if (c === 'neuf') return 'Neuf, scellé';
  if (c === 'occasion') return 'Occasion';
  return 'Reconditionné';
}
