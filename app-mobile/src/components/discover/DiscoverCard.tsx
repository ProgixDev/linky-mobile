import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, FlatList, Pressable, Share, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  Heart,
  Share2,
  Sparkles as SparklesIcon,
  RotateCcw,
  Video as VideoIcon,
  CloudOff,
  MapPin,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { formatGNF, formatEUR, formatDistance } from '../../lib/format';
import { gnfToEur } from '../../lib/currency';
import { haptic } from '../../lib/haptics';
import { useFavorites } from '../../stores/favorites';
import { usePrefs } from '../../stores/prefs';
import { useAuth } from '../../stores/auth';
import { useToggleFavorite } from '../../data/queries/products';
import { useTogglePropertyFavorite } from '../../data/queries/properties';
import type { DiscoverItem } from '../../data/types';

const { width: SW, height: SH } = Dimensions.get('window');

// Reserved width on the right side so bottom text doesn't run under the action rail.
const RAIL_WIDTH = 72;

export function DiscoverCard({
  data,
  isActive,
  height = SH,
}: {
  data: DiscoverItem;
  isActive: boolean;
  height?: number;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const dataSaver = usePrefs((s) => s.dataSaver);
  const roles = useAuth((s) => s.roles);
  const isBuyer = roles.includes('buyer');
  const isSeller = roles.includes('seller');
  const isAgent = roles.includes('agent');
  const isPureAgent = isAgent && !isSeller && !isBuyer;
  const isPureSeller = isSeller && !isAgent && !isBuyer;
  const isPurePro = isPureAgent || isPureSeller;

  const isProduct = data.kind === 'product';
  const id = data.item.id;
  const title = data.item.title;
  const price = data.item.priceGnf;
  const perMonth = !isProduct && data.kind === 'property' ? data.item.perMonth : false;
  const photos = data.item.photos;
  const videoUrl = !isProduct ? data.item.videoUrl : undefined;
  const district = !isProduct ? data.item.district : isProduct ? data.item.city : '';
  const distanceToRoad = !isProduct ? data.item.distanceToRoadMeters : undefined;
  const isFav = useFavorites((s) =>
    isProduct ? s.productIds.has(id) : s.propertyIds.has(id),
  );
  const toggleFavLocal = useFavorites((s) => (isProduct ? s.toggleProduct : s.toggleProperty));
  // Server-truth like persistence. Both endpoints return the new fav_count ;
  // we keep the displayed count optimistic so the heart-tap feels instant
  // and reconcile with the server response on success. Failure reverts both
  // the local heart flag and the optimistic count.
  const toggleProductFav = useToggleFavorite();
  const togglePropertyFav = useTogglePropertyFavorite();
  const serverFavCount = data.item.favCount ?? 0;
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);
  // Reset optimistic state when the underlying server count changes (refetch).
  useEffect(() => { setOptimisticCount(null); }, [serverFavCount]);
  const displayCount = optimisticCount ?? serverFavCount;

  const onLike = () => {
    haptic.light();
    const willFavorite = !isFav;
    // Optimistic UI : flip local heart + count immediately.
    toggleFavLocal(id);
    setOptimisticCount(displayCount + (willFavorite ? 1 : -1));
    const onErr = () => {
      // Roll back both : flip the heart back, drop the optimistic delta.
      toggleFavLocal(id);
      setOptimisticCount(null);
    };
    const onOk = (res: { fav_count: number }) => {
      setOptimisticCount(res.fav_count);
    };
    if (isProduct) {
      toggleProductFav.mutate(id, { onSuccess: onOk, onError: onErr });
    } else {
      togglePropertyFav.mutate(id, { onSuccess: onOk, onError: onErr });
    }
  };

  // Manual photo swipe — horizontal pager inside each reel item. The outer
  // vertical reel pager keeps working ; React Native's nested-scroll handling
  // routes the dominant axis to the matching scroller.
  // photoIdx is updated from onMomentumScrollEnd so the dot indicator stays
  // in lockstep with the active photo, regardless of who triggered the swipe.
  const [photoIdx, setPhotoIdx] = useState(0);
  const photoListRef = useRef<FlatList<string>>(null);
  // When the reel scrolls off-screen and back, jump the pager to photo 0 so a
  // returning user always sees the cover, not whatever they last swiped to.
  useEffect(() => {
    if (!isActive) {
      setPhotoIdx(0);
      photoListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [isActive]);
  const onPhotoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / SW);
    if (next !== photoIdx && next >= 0 && next < photos.length) setPhotoIdx(next);
  };
  // FlatList only needs to know how to size each item ; keys = stable per
  // photo url (deduped — duplicate photo URLs are rare but would break keys).
  const photoKeys = useMemo(() => photos.map((p, i) => `${i}:${p}`), [photos]);

  // Video — only autoplay if NOT data saver AND we have a video URL
  const enableVideo = !!videoUrl && !dataSaver;
  const player = useVideoPlayer(enableVideo ? (videoUrl as string) : '', (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (!enableVideo) return;
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player, enableVideo]);

  // Heart pop on double-tap
  const heartScale = useSharedValue(0);
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartScale.value > 0 ? 1 : 0,
  }));
  const lastTap = useRef(0);
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      // Double-tap : same as tapping the heart — fires the server toggle so
      // the count persists. Only acts on the favorite path (no unfavorite via
      // double-tap, matching IG/TikTok pattern : double-tap loves, doesn't toggle).
      if (!isFav) onLike();
      haptic.medium();
      heartScale.value = withSpring(1.4, { damping: 8 }, () => {
        heartScale.value = withSpring(0, { damping: 12 });
      });
    }
    lastTap.current = now;
  };

  // Layout constants — anchored to safe area so spacing is consistent on all phones.
  const topInset = Math.max(insets.top, 12);
  const bottomInset = Math.max(insets.bottom, 12);
  const tabBarOverlap = 70 + bottomInset; // matches BottomTabBar's height calc
  const bottomCardOffset = tabBarOverlap + 14;

  return (
    <View style={{ width: SW, height, backgroundColor: colors.discoverBg }}>
      <Pressable onPress={handleTap} style={{ flex: 1 }}>
        {enableVideo ? (
          <VideoView
            player={player}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            contentFit="cover"
            nativeControls={false}
          />
        ) : photos.length > 1 ? (
          <FlatList
            ref={photoListRef}
            data={photos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => photoKeys[i] ?? String(i)}
            onMomentumScrollEnd={onPhotoScroll}
            scrollEventThrottle={16}
            removeClippedSubviews
            initialNumToRender={2}
            windowSize={3}
            getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            renderItem={({ item: photo, index }) => (
              <Image
                source={photo}
                style={{ width: SW, height: '100%' }}
                contentFit="cover"
                recyclingKey={`disc-${id}-${index}`}
                transition={dataSaver ? 0 : 200}
                priority={isActive && index === photoIdx ? (dataSaver ? 'normal' : 'high') : 'low'}
              />
            )}
          />
        ) : (
          <Image
            source={photos[0]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            contentFit="cover"
            recyclingKey={`disc-${id}-0`}
            transition={dataSaver ? 0 : 300}
            priority={isActive ? (dataSaver ? 'normal' : 'high') : 'low'}
          />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent', 'transparent', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.18, 0.45, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* ===== Top filter pills (hidden for pure pros) ===== */}
        {!isPurePro && (
          <View
            style={{
              position: 'absolute',
              top: topInset + 8,
              left: 0,
              right: 0,
              paddingHorizontal: 16,
              flexDirection: 'row',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }} />
            {dataSaver && (
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.12)',
                }}
              >
                <CloudOff size={14} color="#FFFFFF" strokeWidth={2} />
              </View>
            )}
          </View>
        )}

        {/* ===== Video / carousel indicator ===== */}
        {videoUrl ? (
          <View
            style={{
              position: 'absolute',
              top: topInset + (isPurePro ? 12 : 56),
              left: 16,
              flexDirection: 'row',
              gap: 6,
              alignItems: 'center',
              paddingVertical: 6,
              paddingHorizontal: 11,
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.5)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
            }}
          >
            <VideoIcon size={12} color="#FFFFFF" strokeWidth={2} />
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: '#FFFFFF',
                lineHeight: 13,
                includeFontPadding: false,
                letterSpacing: 0,
              }}
            >
              {dataSaver ? t('decouvrir.card.visiteVideoPaused') : t('decouvrir.card.visiteVideo')}
            </Text>
          </View>
        ) : photos.length > 1 ? (
          <View
            style={{
              position: 'absolute',
              top: topInset + (isPurePro ? 12 : 56),
              left: 0,
              right: 0,
              flexDirection: 'row',
              gap: 4,
              justifyContent: 'center',
            }}
          >
            {photos.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === photoIdx ? 22 : 5,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: i === photoIdx ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                }}
              />
            ))}
          </View>
        ) : null}

        {/* ===== Double-tap heart pop ===== */}
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', left: '50%', top: '40%', marginLeft: -42, marginTop: -42 },
            heartStyle,
          ]}
        >
          <Heart size={84} color="#FFFFFF" fill="#FFFFFF" strokeWidth={0} />
        </Animated.View>

        {/* ===== Right-rail actions ===== */}
        <DiscoverRail
          isFav={isFav}
          onLike={onLike}
          onShare={() => {
            haptic.light();
            void Share.share({ message: t('decouvrir.card.shareMessage') }).catch(() => {});
          }}
          likeCount={String(displayCount)}
          bottomAnchor={bottomCardOffset + 60} // sits just above the bottom card
        />

        {/* ===== Bottom info card ===== */}
        <View
          style={{
            position: 'absolute',
            bottom: bottomCardOffset,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
          }}
          pointerEvents="box-none"
        >
          {/* Title */}
          <View style={{ paddingRight: RAIL_WIDTH }}>
            <Text
              numberOfLines={2}
              style={{
                color: '#FFFFFF',
                fontSize: 18,
                fontWeight: '700',
                lineHeight: 24,
                letterSpacing: -0.2,
                marginBottom: 8,
              }}
            >
              {title}
            </Text>

            {/* Price row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 22,
                  fontWeight: '700',
                  fontVariant: ['tabular-nums'],
                  letterSpacing: -0.3,
                  lineHeight: 26,
                  includeFontPadding: false,
                }}
              >
                {formatGNF(price)}
              </Text>
              {perMonth && (
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 13,
                    fontWeight: '600',
                    letterSpacing: 0,
                  }}
                >
                  /mois
                </Text>
              )}
              <Text
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: 12,
                  fontWeight: '500',
                  letterSpacing: 0,
                }}
              >
                {formatEUR(gnfToEur(price))}
              </Text>
            </View>

            {/* Location + distance chip */}
            {district && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 16,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                  <MapPin size={12} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.85)',
                      fontSize: 12,
                      fontWeight: '500',
                      letterSpacing: 0,
                    }}
                  >
                    {district}
                  </Text>
                </View>
                {distanceToRoad != null && (
                  <View
                    style={{
                      paddingHorizontal: 9,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: colors.accent,
                      flexDirection: 'row',
                      gap: 4,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: '#2A1A05',
                        fontSize: 11,
                        fontWeight: '700',
                        lineHeight: 13,
                        includeFontPadding: false,
                        letterSpacing: 0.2,
                      }}
                    >
                      {formatDistance(distanceToRoad)}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* CTA — brand green + white bold, replaces the white/faint pill. */}
          <Pressable
            onPress={() => router.push(isProduct ? `/product/${id}` : `/property/${id}`)}
            style={{
              width: '100%',
              height: 50,
              borderRadius: 999,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontWeight: '700',
                fontSize: 15,
                lineHeight: 18,
                includeFontPadding: false,
                letterSpacing: 0.1,
              }}
            >
              {t('decouvrir.card.seeDetail')}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}


function DiscoverRail({
  isFav,
  onLike,
  onShare,
  likeCount,
  bottomAnchor,
}: {
  isFav: boolean;
  onLike: () => void;
  onShare: () => void;
  likeCount: string;
  bottomAnchor: number;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // The old "info" item was a tiny redundant tap target for the same nav as
  // the full-width "See details" CTA below the card. Removed so the rail
  // stays focused on the actions only available here (like + share).
  const items = [
    {
      key: 'like',
      icon: (
        <Heart
          size={22}
          color="#FFFFFF"
          fill={isFav ? '#FFFFFF' : 'transparent'}
          strokeWidth={isFav ? 0 : 2}
        />
      ),
      label: likeCount,
      onPress: onLike,
      bg: isFav ? colors.danger : 'rgba(0,0,0,0.4)',
    },
    {
      key: 'share',
      icon: <Share2 size={20} color="#FFFFFF" strokeWidth={2} />,
      label: t('decouvrir.card.share'),
      onPress: onShare,
      bg: 'rgba(0,0,0,0.4)',
    },
  ];
  return (
    <View
      style={{
        position: 'absolute',
        right: 14,
        bottom: bottomAnchor,
        gap: 16,
        alignItems: 'center',
      }}
    >
      {items.map((it) => (
        <Pressable
          key={it.key}
          onPress={it.onPress}
          hitSlop={6}
          style={{ alignItems: 'center', gap: 4 }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              backgroundColor: it.bg,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {it.icon}
          </View>
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: '700',
              color: '#FFFFFF',
              letterSpacing: 0,
              lineHeight: 12,
              includeFontPadding: false,
            }}
          >
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function DiscoverEnd({ onRefresh }: { onRefresh: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      style={{
        width: SW,
        height: SH,
        backgroundColor: colors.discoverBg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <View
        style={{
          width: 104,
          height: 104,
          borderRadius: 999,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 28,
        }}
      >
        <SparklesIcon size={42} color="#2A1A05" strokeWidth={2.25} />
      </View>
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: 24,
          fontWeight: '700',
          letterSpacing: -0.3,
          textAlign: 'center',
          maxWidth: 260,
          lineHeight: 30,
        }}
      >
        {t('decouvrir.card.endTitle')}
      </Text>
      <Text
        style={{
          color: 'rgba(255,255,255,0.65)',
          fontSize: 14,
          textAlign: 'center',
          marginTop: 12,
          maxWidth: 280,
          lineHeight: 20,
          letterSpacing: 0,
        }}
      >
        {t('decouvrir.card.endBody')}
      </Text>
      <Pressable
        onPress={onRefresh}
        style={{
          marginTop: 28,
          height: 48,
          paddingHorizontal: 24,
          borderRadius: 999,
          backgroundColor: '#FFFFFF',
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RotateCcw size={15} color="#0E1311" strokeWidth={2.25} />
        <Text style={{ color: '#0E1311', fontWeight: '700', fontSize: 14 }}>{t('decouvrir.card.endCta')}</Text>
      </Pressable>
    </View>
  );
}
