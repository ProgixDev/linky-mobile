import { useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Share2,
  MapPin,
  Clock,
  ShieldCheck,
  Star,
  MessageCircle,
  Edit2,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { ProductCard } from '../../src/components/lists/ProductCard';
import {
  useShop,
  useProducts,
  useFindOrCreateConversation,
  useToggleShopFollow,
  useShopReviews,
} from '../../src/data/queries';
import { useAuth } from '../../src/stores/auth';
import { haptic } from '../../src/lib/haptics';
import { shopOpenStatus } from '../../src/lib/shopHours';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { DetailStateScreen } from '../../src/components/feedback/DetailState';
import { Stars } from '../../src/components/reviews/StarRating';

type Tab = 'articles' | 'reviews' | 'about';

const HERO_HEIGHT = 220;

export default function ShopRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data: shop, isLoading, isError, refetch } = useShop(id);
  const { data: products } = useProducts({ shopId: id });
  const { data: reviews } = useShopReviews(id);
  const [tab, setTab] = useState<Tab>('articles');
  // Pre-prod: follow state is server-truth (get-shop returns is_following for
  // authed callers, follower_count is the denormalized cache). The toggle
  // mutation patches both in cache so the CTA and stat column flip together.
  const authUserId = useAuth((s) => s.authUserId);
  const toggleFollow = useToggleShopFollow();
  const isOwnShop = !!authUserId && !!shop?.ownerId && authUserId === shop.ownerId;
  const following = !!shop?.isFollowing;
  // Phase X.2 — shop "Message" wires the same find-or-create-conversation
  // pattern as product/property detail. No pinned listing : the contact is
  // shop-level, not about a specific item.
  const findOrCreate = useFindOrCreateConversation();
  const toast = useToast();
  const onToggleFollow = () => {
    if (!shop) return;
    if (!authUserId) {
      toast.show(t('shop.followAuthRequired'), 'info');
      return;
    }
    if (isOwnShop) return;
    if (toggleFollow.isPending) return;
    haptic.light();
    toggleFollow.mutate(
      { shopId: shop.id },
      {
        onError: (e) => toast.show(toToastMessage(e, t('shop.followError')), 'danger'),
      },
    );
  };
  const onMessagePress = async () => {
    if (!shop?.ownerId || findOrCreate.isPending) return;
    try {
      haptic.light();
      const r = await findOrCreate.mutateAsync({ recipient_id: shop.ownerId });
      router.push(`/messages/${r.conversation_id}`);
    } catch (e) {
      toast.show(toToastMessage(e, "Impossible d'ouvrir la conversation."), 'danger');
    }
  };

  if (isLoading || isError || !shop) {
    return (
      <DetailStateScreen
        loading={isLoading}
        title={t('shop.fallbackTitle')}
        onRetry={() => void refetch()}
      />
    );
  }

  // Phase Y.1 — never render a bare/placeholder response time. The DB used to
  // ship a mojibake em-dash placeholder ; we now blank that and only show the
  // segment when a real value is present.
  const hasResponseTime = shop.responseTime.trim().length > 0;
  // Dynamic opening status derived from the owner's configured schedule.
  const status = shopOpenStatus(shop.openingHours);
  const statusColor = status.is24h ? colors.accentText : status.isOpen ? colors.primaryDeep : colors.textMuted;
  const statusBg = status.is24h ? colors.accentSoft : status.isOpen ? colors.primarySoft : colors.bgSunken;
  // Phase Y.2 / I.3d — count/rating honesty + pluralization via i18next.
  const articlesLabel = t('shop.article', { count: shop.productCount });
  const isNewShop = shop.reviewCount === 0;
  const hasAbout = shop.about.trim().length > 0;
  const hasAvatar = typeof shop.avatar === 'string' && shop.avatar.length > 0;
  const initials = (shop.name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ===== Cover hero ===== */}
        <View
          style={{ height: HERO_HEIGHT, backgroundColor: colors.bgSunken, position: 'relative' }}
        >
          <Image source={shop.cover} style={{ flex: 1 }} contentFit="cover" />
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
            locations={[0, 0.45, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* Top action row */}
          <View
            style={{
              position: 'absolute',
              top: 54,
              left: 16,
              right: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <CircleButton onPress={() => router.back()} accessibilityLabel="Retour">
              <ArrowLeft size={18} color="#1F2421" strokeWidth={2} />
            </CircleButton>
            {/* Phase X.7 — Share wired to native Share API (message-only ;
                a linky:// URL would dead-end for recipients without the
                app) ; "Plus" kebab removed (no V1 per-shop menu). */}
            <CircleButton
              onPress={() => {
                void Share.share({
                  title: shop.name,
                  message: `${shop.name} sur Linky`,
                }).catch(() => {});
              }}
              accessibilityLabel="Partager"
            >
              <Share2 size={16} color="#1F2421" strokeWidth={2} />
            </CircleButton>
          </View>
        </View>

        {/* ===== Card overlapping the cover ===== */}
        <View style={{ paddingHorizontal: 20, marginTop: -48 }}>
          <View
            style={{
              backgroundColor: colors.bg,
              borderRadius: 24,
              padding: 18,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              <View style={{ position: 'relative' }}>
                {hasAvatar ? (
                  <Image
                    source={shop.avatar}
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 20,
                      backgroundColor: colors.bgSunken,
                    }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 20,
                      backgroundColor: colors.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    accessibilityLabel={shop.name}
                  >
                    <Text
                      style={{
                        fontSize: 26,
                        fontWeight: '700',
                        color: colors.accentText,
                        letterSpacing: 0,
                      }}
                    >
                      {initials}
                    </Text>
                  </View>
                )}
                {shop.verified && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: colors.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 3,
                      borderColor: colors.bg,
                    }}
                  >
                    <ShieldCheck size={11} color="#FFFFFF" strokeWidth={3} />
                  </View>
                )}
              </View>

              <View style={{ flex: 1, paddingTop: 4 }}>
                <Text
                  style={{
                    fontSize: 19,
                    fontWeight: '700',
                    color: colors.text,
                    letterSpacing: -0.2,
                  }}
                  numberOfLines={1}
                >
                  {shop.name}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 4,
                  }}
                >
                  <MapPin size={11} color={colors.textMuted} strokeWidth={2} />
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.textMuted,
                      letterSpacing: 0,
                    }}
                    numberOfLines={1}
                  >
                    {shop.city}
                  </Text>
                  {hasResponseTime && (
                    <>
                      <Text style={{ fontSize: 12, color: colors.textFaint }}>·</Text>
                      <Clock size={11} color={colors.textMuted} strokeWidth={2} />
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.textMuted,
                          letterSpacing: 0,
                        }}
                      >
                        {shop.responseTime}
                      </Text>
                    </>
                  )}
                </View>

                {/* Dynamic open/closed + 24/24h badge from the owner's schedule. */}
                {status.configured && (
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 8,
                      paddingHorizontal: 8,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: statusBg,
                    }}
                  >
                    <Clock size={10.5} color={statusColor} strokeWidth={2.25} />
                    <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3, color: statusColor }}>
                      {status.is24h ? '24/24h' : status.isOpen ? 'Ouvert' : 'Fermé'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Stats row */}
            <View
              style={{
                flexDirection: 'row',
                marginTop: 16,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <StatColumn
                value={
                  shop.followerCount >= 1000
                    ? `${(shop.followerCount / 1000).toFixed(1)}k`
                    : String(shop.followerCount)
                }
                label={t('shop.follower', { count: shop.followerCount })}
              />
              <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
              <StatColumn value={String(shop.productCount)} label={articlesLabel} />
              <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
              {isNewShop ? (
                <StatColumn value={t('shop.newBadge')} label={t('shop.noReviewsYet')} />
              ) : (
                <StatColumn
                  value={shop.rating.toFixed(1)}
                  label={t('shop.reviewsCount', { count: shop.reviewCount })}
                  trailing={<Star size={11} color={colors.accent} fill={colors.accent} />}
                />
              )}
            </View>

            {/* Actions — own-shop owners get a single "manage" CTA instead of
                the follow + message row meant for other users (the message
                Pressable previously stayed tappable on your own shop and
                surfaced the backend's self-deal 403 as an error toast). */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              {isOwnShop ? (
                <Button
                  variant="outline"
                  size="md"
                  label={t('shop.manageMyShop')}
                  leading={<Edit2 size={15} color={colors.text} strokeWidth={2} />}
                  style={{ flex: 1 }}
                  onPress={() => router.push('/shop/edit')}
                />
              ) : (
                <>
                  <Button
                    variant={following ? 'outline' : 'dark'}
                    size="md"
                    label={following ? t('shop.following') : t('shop.follow')}
                    style={{ flex: 2 }}
                    loading={toggleFollow.isPending}
                    disabled={toggleFollow.isPending}
                    onPress={onToggleFollow}
                  />
                  <Pressable
                    onPress={onMessagePress}
                    disabled={findOrCreate.isPending || !shop?.ownerId}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 999,
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.borderStrong,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      opacity: findOrCreate.isPending || !shop?.ownerId ? 0.5 : 1,
                    }}
                    accessibilityLabel={t('shop.contactSeller')}
                  >
                    <MessageCircle size={15} color={colors.text} strokeWidth={2} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                      {t('shop.message')}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ===== Tab pills ===== */}
        <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
          <View
            style={{
              flexDirection: 'row',
              gap: 6,
              padding: 4,
              borderRadius: 999,
              backgroundColor: colors.bgSunken,
            }}
          >
            {(['articles', 'reviews', 'about'] as const).map((tabId) => {
              const active = tab === tabId;
              const label =
                tabId === 'articles'
                  ? t('shop.tabArticles')
                  : tabId === 'reviews'
                    ? t('shop.tabReviews')
                    : t('shop.tabAbout');
              return (
                <Pressable
                  key={tabId}
                  onPress={() => {
                    haptic.selection();
                    setTab(tabId);
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
                      fontSize: 13.5,
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
            })}
          </View>
        </View>

        {/* ===== Tab content ===== */}
        {tab === 'articles' && (
          <View
            style={{
              padding: 20,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 14,
            }}
          >
            {products?.map((p) => (
              <View key={p.id} style={{ flexBasis: '47%', flexGrow: 1 }}>
                <ProductCard product={p} compact />
              </View>
            ))}
          </View>
        )}

        {tab === 'reviews' && (
          <View style={{ padding: 20 }}>
            <View
              style={{
                padding: 20,
                borderRadius: 20,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: isNewShop ? 22 : 36,
                    fontWeight: '700',
                    color: colors.text,
                    lineHeight: isNewShop ? 26 : 40,
                    fontVariant: isNewShop ? undefined : ['tabular-nums'],
                    letterSpacing: isNewShop ? 0 : -1,
                  }}
                >
                  {isNewShop ? t('shop.newBadge') : shop.rating.toFixed(1)}
                </Text>
                {!isNewShop && (
                  <View style={{ flexDirection: 'row', gap: 1, marginTop: 4 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star
                        key={i}
                        size={13}
                        color={i < Math.round(shop.rating) ? colors.accent : colors.border}
                        fill={i < Math.round(shop.rating) ? colors.accent : 'transparent'}
                      />
                    ))}
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.textMuted,
                    lineHeight: 18,
                    letterSpacing: 0,
                  }}
                >
                  {isNewShop
                    ? t('shop.reviewsNone', { name: shop.name })
                    : t('shop.reviewsBasedOn', { count: shop.reviewCount, name: shop.name })}
                </Text>
              </View>
            </View>
            {!isNewShop &&
              (reviews && reviews.length > 0 ? (
                <View style={{ marginTop: 16, gap: 12 }}>
                  {reviews.map((rv) => (
                    <View
                      key={rv.id}
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                        gap: 6,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                          {rv.reviewerName ?? 'Client'}
                        </Text>
                        <Stars rating={rv.rating} />
                      </View>
                      {rv.comment ? (
                        <Text
                          style={{
                            fontSize: 13,
                            color: colors.textMuted,
                            lineHeight: 18,
                            letterSpacing: 0,
                          }}
                        >
                          {rv.comment}
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: 11, color: colors.textMuted, letterSpacing: 0 }}>
                        {new Date(rv.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.textMuted,
                    marginTop: 20,
                    textAlign: 'center',
                    letterSpacing: 0,
                  }}
                >
                  {t('shop.reviewsDetailsSoon')}
                </Text>
              ))}
          </View>
        )}

        {tab === 'about' && (
          <View style={{ padding: 20 }}>
            <View
              style={{
                padding: 18,
                borderRadius: 20,
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
                  marginBottom: 8,
                }}
              >
                {t('shop.aboutHeading')}
              </Text>
              <Text
                style={{
                  fontSize: 14.5,
                  color: hasAbout ? colors.text : colors.textMuted,
                  lineHeight: 22,
                  letterSpacing: 0,
                  fontStyle: hasAbout ? 'normal' : 'italic',
                }}
              >
                {hasAbout ? shop.about : t('shop.aboutEmpty')}
              </Text>
            </View>

            <View style={{ marginTop: 14, gap: 10 }}>
              <InfoRow Icon={MapPin} label={t('shop.infoVille')} value={shop.city} />
              {status.configured && (
                <InfoRow
                  Icon={Clock}
                  label={t('shop.infoHours')}
                  value={status.is24h ? 'Ouvert 24h/24, 7j/7' : status.scheduleText}
                  accent={status.is24h}
                />
              )}
              {hasResponseTime && (
                <InfoRow
                  Icon={Clock}
                  label={t('shop.infoResponseTime')}
                  value={shop.responseTime}
                />
              )}
              {shop.verified && (
                <InfoRow
                  Icon={ShieldCheck}
                  label={t('shop.infoVerified')}
                  value={t('shop.infoVerifiedValue')}
                  accent
                />
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------- Subcomponents ----------

function CircleButton({
  onPress,
  children,
  accessibilityLabel,
}: {
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      accessibilityLabel={accessibilityLabel}
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

function StatColumn({
  value,
  label,
  trailing,
}: {
  value: string;
  label: string;
  trailing?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text
          style={{
            fontSize: 17,
            fontWeight: '700',
            color: colors.text,
            fontVariant: ['tabular-nums'],
            letterSpacing: 0,
          }}
        >
          {value}
        </Text>
        {trailing}
      </View>
      <Text
        style={{
          fontSize: 11.5,
          color: colors.textMuted,
          letterSpacing: 0,
          marginTop: 2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function InfoRow({
  Icon,
  label,
  value,
  accent,
}: {
  Icon: typeof MapPin;
  label: string;
  value: string;
  accent?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 14,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: accent ? colors.accentSoft : colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={14} color={accent ? colors.accentText : colors.text} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: colors.textFaint,
            letterSpacing: 0.5,
          }}
        >
          {label.toUpperCase()}
        </Text>
        <Text
          style={{
            fontSize: 13.5,
            fontWeight: '600',
            color: colors.text,
            marginTop: 1,
            letterSpacing: 0,
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}
