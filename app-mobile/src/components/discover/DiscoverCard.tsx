import { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  Heart,
  Share2,
  Info,
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
  const toggleFav = useFavorites((s) => (isProduct ? s.toggleProduct : s.toggleProperty));

  // image carousel auto-rotate when active. Pre-prod: data-saver also kills
  // the silent every-4s photo refetch — each rotation pulls a fresh image
  // off the network on 3G, which is exactly what the saver is meant to stop.
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => {
    if (!isActive || photos.length <= 1 || videoUrl || dataSaver) return;
    const t = setInterval(() => {
      setPhotoIdx((i) => (i + 1) % photos.length);
    }, 4000);
    return () => clearInterval(t);
  }, [isActive, photos.length, videoUrl, dataSaver]);

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
      if (!isFav) toggleFav(id);
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
        ) : (
          <Image
            source={photos[photoIdx]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            contentFit="cover"
            recyclingKey={`disc-${id}-${photoIdx}`}
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
              Visite vidéo{dataSaver ? ' · en pause' : ''}
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
          onLike={() => {
            haptic.light();
            toggleFav(id);
          }}
          onShare={() => {
            haptic.light();
            void Share.share({ message: 'Découvre cette annonce sur Linky' }).catch(() => {});
          }}
          onDetails={() => router.push(isProduct ? `/product/${id}` : `/property/${id}`)}
          likeCount={isProduct ? data.item.favCount.toString() : ''}
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

          {/* CTA */}
          <Pressable
            onPress={() => router.push(isProduct ? `/product/${id}` : `/property/${id}`)}
            style={{
              width: '100%',
              height: 50,
              borderRadius: 999,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontWeight: '700',
                fontSize: 15,
                lineHeight: 18,
                includeFontPadding: false,
                letterSpacing: 0.1,
              }}
            >
              Voir le détail
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

// =================================================================

function FeedPill({ label, active }: { label: string; active?: boolean }) {
  return (
    <View
      style={{
        height: 32,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: active ? '#FFFFFF' : 'rgba(0,0,0,0.4)',
        borderWidth: active ? 0 : 1,
        borderColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: '700',
          color: active ? '#0E1311' : '#FFFFFF',
          lineHeight: 15,
          includeFontPadding: false,
          letterSpacing: 0,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function DiscoverRail({
  isFav,
  onLike,
  onShare,
  onDetails,
  likeCount,
  bottomAnchor,
}: {
  isFav: boolean;
  onLike: () => void;
  onShare: () => void;
  onDetails: () => void;
  likeCount: string;
  bottomAnchor: number;
}) {
  const { colors } = useTheme();
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
      label: 'Partager',
      onPress: onShare,
      bg: 'rgba(0,0,0,0.4)',
    },
    {
      key: 'info',
      icon: <Info size={20} color="#FFFFFF" strokeWidth={2} />,
      label: 'Détails',
      onPress: onDetails,
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
        Tu as tout vu pour aujourd'hui.
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
        Reviens demain pour de nouveaux articles et logements à découvrir.
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
        <Text style={{ color: '#0E1311', fontWeight: '700', fontSize: 14 }}>Actualiser</Text>
      </Pressable>
    </View>
  );
}
