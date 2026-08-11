import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, FlatList, Pressable, Share, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  Heart,
  Share2,
  MessageCircle,
  Sparkles as SparklesIcon,
  RotateCcw,
  Play,
  Video as VideoIcon,
  CloudOff,
  MapPin,
  MoreHorizontal,
  EyeOff,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { formatGNF, formatEUR, formatDistance } from '../../lib/format';
import { gnfToEur } from '../../lib/currency';
import { haptic } from '../../lib/haptics';
import { shareMessage } from '../../lib/share';
import { useFavorites } from '../../stores/favorites';
import { useHiddenListings } from '../../stores/hiddenListings';
import { usePrefs } from '../../stores/prefs';
import { useAuth } from '../../stores/auth';
import { useToast } from '../feedback/Toast';
import { useToggleFavorite } from '../../data/queries/products';
import { useTogglePropertyFavorite } from '../../data/queries/properties';
import type { DiscoverItem } from '../../data/types';

// SH is only the fallback for the `height` default param (the parent pager
// passes the real measured height). WIDTH must be LIVE — a static
// Dimensions.get() captured once at module load doesn't update when the user
// changes Android "screen zoom" (display size), which left the card narrower
// than the screen (black bar + clipped CTA). Each component reads the live
// window width via useWindowDimensions() instead (client 2026-07-30).
const { height: SH } = Dimensions.get('window');
const CARD_MAX_W = 500;

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
  const { show } = useToast();
  const hideListing = useHiddenListings((s) => s.hide);
  const insets = useSafeAreaInsets();
  // Live window width → card always fills the screen at any Android screen-zoom
  // / display-size setting (was a stale module-level Dimensions.get()).
  const { width: winW } = useWindowDimensions();
  const SW = Math.min(winW, CARD_MAX_W);
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
  // Rentals show their billing unit; sales/terrains show a bare price. The
  // old `perMonth`-only gate left daily rentals unit-less (looked like a
  // sale price on the highest-traffic buyer surface).
  const rentalSuffix =
    !isProduct && data.kind === 'property' && data.item.type === 'location'
      ? data.item.perMonth
        ? '/mois'
        : '/jour'
      : null;
  const photos = data.item.photos;
  // Video plays for BOTH products and properties now (client 2026-08-03 — product
  // listings can carry an optional video, parity with immo).
  const videoUrl = data.item.videoUrl;
  const district = !isProduct ? data.item.district : isProduct ? data.item.city : '';
  const distanceToRoad = !isProduct ? data.item.distanceToRoadMeters : undefined;
  // Heart state: the local store is the single source of truth for RENDERING
  // (seeded from the server once, then updated by explicit SETs below).
  //
  // Bug fixed 2026-08-06: the previous version read `serverFav ?? localFav`
  // on every render. `serverFav` (data.item.favorited) is a snapshot from
  // whenever this feed PAGE was fetched — it never changes just because the
  // user tapped the heart, so with `??` it permanently shadowed the local
  // toggle. Symptoms matched exactly what the client reported : the heart
  // never turned red (isFav kept re-reading the frozen "not favorited"
  // snapshot), repeated taps each recomputed the SAME "willFavorite=true"
  // intent (since isFav never flipped), sending the server's real toggle RPC
  // back and forth — which is why the count bounced and "reset to 0" once the
  // client's optimistic math and the server's real alternating state diverged.
  const localFav = useFavorites((s) =>
    isProduct ? s.productIds.has(id) : s.propertyIds.has(id),
  );
  const setLocalFav = useFavorites((s) => (isProduct ? s.setProductFav : s.setPropertyFav));
  const serverFav = data.item.favorited;
  // Re-seed only when the SERVER sends a genuinely new verdict (mount, or a
  // real refetch) — never on a re-render caused by our own optimistic tap.
  const seededServerFav = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (serverFav === undefined) return; // anonymous caller — local store already is truth
    if (seededServerFav.current === serverFav) return;
    seededServerFav.current = serverFav;
    setLocalFav(id, serverFav);
  }, [serverFav, id, setLocalFav]);
  const isFav = localFav;
  // Server-truth like persistence. Both endpoints return the new fav_count ;
  // we keep the displayed count optimistic so the heart-tap feels instant
  // and reconcile with the server response on success. Failure reverts both
  // the local heart flag and the optimistic count.
  const toggleProductFav = useToggleFavorite();
  const togglePropertyFav = useTogglePropertyFavorite();
  const serverFavCount = data.item.favCount ?? 0;
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);
  // Drop the optimistic value whenever the server sends a fresh truth (refetch)
  // — either a new count OR a new heart state.
  useEffect(() => { setOptimisticCount(null); }, [serverFavCount, serverFav]);
  const displayCount = optimisticCount ?? serverFavCount;

  const onLike = () => {
    // Ignore taps while a toggle for THIS card is already in flight — a fast
    // double-tap used to fire two overlapping "toggle" requests at the real,
    // non-idempotent server RPC, which flipped the row TWICE (like → unlike)
    // and is exactly how repeated taps ended up back at the original count
    // (client 2026-08-06). One tap in flight at a time ; the heart already
    // animates instantly below so this reads as a single fluid gesture, not
    // a delay.
    if (toggleProductFav.isPending || togglePropertyFav.isPending) return;
    haptic.light();
    const previous = isFav;
    const willFavorite = !previous;
    // Optimistic UI : SET (not toggle) the local heart + move the count. Using
    // an explicit set — rather than the old toggle-and-hope — means repeated
    // or overlapping calls always converge to the last known intent instead
    // of compounding. Clamp at 0 : a like count can never go negative.
    setLocalFav(id, willFavorite);
    setOptimisticCount(Math.max(0, displayCount + (willFavorite ? 1 : -1)));
    const onErr = () => {
      setLocalFav(id, previous);
      setOptimisticCount(null);
    };
    const onOk = (res: { fav_count: number; favorited: boolean }) => {
      // Server truth wins for BOTH values, so heart and count stay in lockstep.
      setOptimisticCount(Math.max(0, res.fav_count));
      setLocalFav(id, res.favorited);
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
  // User can pause the reel (video OR the auto-advancing photo slideshow) with
  // a single tap ; double-tap still likes (see handleTap).
  const [paused, setPaused] = useState(false);
  // « … » options menu (Masquer / Pas intéressé). Per-card state — only the
  // active card's menu can be open ; scrolling away closes it (see effect below).
  const [menuOpen, setMenuOpen] = useState(false);
  // AUTO + MANUAL (client 2026-07-31) : photos auto-advance AND stay swipeable.
  // A manual swipe just stamps this timestamp so the auto-advance skips its next
  // ticks for ~4s — it never jumps off the photo the user swiped to, then
  // resumes. No permanent stop.
  const lastPhotoInteractRef = useRef(0);
  const onHideListing = () => {
    haptic.medium();
    setMenuOpen(false);
    hideListing(data.kind, id);
    // The feed filters this listing out (useHiddenListings) so the card leaves
    // the feed ; the toast confirms the action. French literal (client is
    // French-first) — avoids touching the 3 locale files for one menu.
    show('Masqué de ton feed', 'info');
  };
  const photoListRef = useRef<FlatList<string>>(null);
  // When the reel scrolls off-screen and back, jump the pager to photo 0 so a
  // returning user always sees the cover, not whatever they last swiped to.
  useEffect(() => {
    if (!isActive) {
      setPhotoIdx(0);
      setPaused(false);
      setMenuOpen(false);
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
    // Sound ON (client 2026-07-27) — hear the video's audio if it has any.
    // Only the active reel plays (see effect below), so just one plays at a time.
    p.muted = false;
  });
  useEffect(() => {
    if (!enableVideo) return;
    if (isActive && !paused) player.play();
    else player.pause();
  }, [isActive, player, enableVideo, paused]);

  // No video → photos AUTO-advance like a story (4s/image, looping) AND stay
  // manually swipeable. A tick is skipped while the user is mid-swipe or within
  // 4s of one (lastPhotoInteractRef), so the auto-advance never jumps off the
  // photo they just swiped to — it resumes ~4s after they stop.
  useEffect(() => {
    if (enableVideo || !isActive || paused || photos.length <= 1) return;
    const timer = setInterval(() => {
      if (Date.now() - lastPhotoInteractRef.current < 4000) return;
      setPhotoIdx((i) => {
        const next = (i + 1) % photos.length;
        photoListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [enableVideo, isActive, paused, photos.length]);

  // Heart pop on double-tap
  const heartScale = useSharedValue(0);
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartScale.value > 0 ? 1 : 0,
  }));
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clear any pending single-tap when the card goes inactive (scroll / tab
  // switch) or unmounts — else the stray timer fires setPaused on the now
  // inactive card and it stays paused (won't auto-resume) on return.
  useEffect(() => {
    if (!isActive && singleTapTimer.current) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
    }
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, [isActive]);
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      // Double-tap : like (server toggle so the count persists). Cancels the
      // pending single-tap so a double-tap never also pauses. No unfavorite via
      // double-tap (IG/TikTok pattern : double-tap loves, doesn't toggle).
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      if (!isFav) onLike();
      haptic.medium();
      heartScale.value = withSpring(1.4, { damping: 8 }, () => {
        heartScale.value = withSpring(0, { damping: 12 });
      });
    } else {
      // Single-tap (confirmed after the double-tap window) : pause / resume the
      // video or the photo slideshow so the user can stop on one shot.
      singleTapTimer.current = setTimeout(() => {
        setPaused((p) => !p);
        haptic.light();
        singleTapTimer.current = null;
      }, 280);
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
            onScrollBeginDrag={() => { lastPhotoInteractRef.current = Date.now(); }}
            onMomentumScrollEnd={(e) => { lastPhotoInteractRef.current = Date.now(); onPhotoScroll(e); }}
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

        {/* Pause overlay — single tap pauses the video / photo slideshow so the
            user can stop on one shot ; the play glyph signals it's paused. */}
        {paused && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                backgroundColor: 'rgba(0,0,0,0.55)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Play size={28} color="#FFFFFF" fill="#FFFFFF" strokeWidth={1.5} />
            </View>
          </View>
        )}

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

        {/* ===== Video / carousel indicator =====
            The « Visite vidéo » pill is hidden when the video simply plays
            (client 2026-08-07): on a video-first feed it labelled the obvious
            and sat on top of the image. It STAYS in data-saver mode, where it
            is the only thing explaining why the video is frozen — dropping it
            there would leave a still frame and no reason for it. */}
        {videoUrl ? (dataSaver ? (
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
              {t('decouvrir.card.visiteVideoPaused')}
            </Text>
          </View>
        ) : null) : photos.length > 1 ? (
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
                  width: i === photoIdx ? 22 : 6,
                  height: 6,
                  borderRadius: 999,
                  // Client 2026-07-30 : indicateur vert, point actif blanc.
                  backgroundColor: i === photoIdx ? '#FFFFFF' : colors.primary,
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
          onComment={() => {
            haptic.light();
            router.push(`/comments/${isProduct ? 'product' : 'property'}/${id}` as never);
          }}
          onShare={() => {
            haptic.light();
            // Was a generic sentence that didn't even say WHICH listing was
            // being shared — now the title + a real link to it.
            void Share.share({
              message: shareMessage(
                `${data.item.title} — sur Linky`,
                isProduct ? 'product' : 'property',
                id,
              ),
            }).catch(() => {});
          }}
          onMore={() => {
            haptic.light();
            setMenuOpen(true);
          }}
          likeCount={String(displayCount)}
          commentCount={String(data.item.commentCount ?? 0)}
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
              {rentalSuffix && (
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 13,
                    fontWeight: '600',
                    letterSpacing: 0,
                  }}
                >
                  {rentalSuffix}
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

      {/* « … » options menu — centred modal (no tab-bar math). Masquer / Pas
          intéressé hides the listing from the feed for good (this device). */}
      {menuOpen && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <Pressable
            onPress={() => setMenuOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
          <View
            style={{
              width: '100%',
              maxWidth: 340,
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 8,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                textAlign: 'center',
                color: colors.textMuted,
                fontSize: 13,
                paddingVertical: 12,
                paddingHorizontal: 12,
                letterSpacing: 0,
              }}
            >
              Cette annonce ne t&apos;intéresse pas ?
            </Text>
            <Pressable
              onPress={onHideListing}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14 }}
            >
              <EyeOff size={20} color={colors.text} strokeWidth={2} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>Masquer de mon feed</Text>
            </Pressable>
            <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 8 }} />
            <Pressable onPress={() => setMenuOpen(false)} style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textMuted }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}


function DiscoverRail({
  isFav,
  onLike,
  onComment,
  onShare,
  onMore,
  likeCount,
  commentCount,
  bottomAnchor,
}: {
  isFav: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onMore: () => void;
  likeCount: string;
  commentCount: string;
  bottomAnchor: number;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Client 2026-07-30: right rail = icons only. The "Commenter" / "Partager"
  // WORD labels are dropped (kept as accessibility labels for screen readers).
  // The like COUNT stays under the heart — it's data, not a label.
  const items = [
    {
      key: 'like',
      icon: (
        // Instagram-style : the heart itself fills solid red when liked (not
        // the circle behind it) — white outline, no fill, when not liked
        // (client 2026-08-06).
        <Heart
          size={22}
          color={isFav ? colors.danger : '#FFFFFF'}
          fill={isFav ? colors.danger : 'transparent'}
          strokeWidth={isFav ? 0 : 2}
        />
      ),
      label: likeCount,
      a11y: "J'aime",
      onPress: onLike,
      bg: 'rgba(0,0,0,0.4)',
    },
    {
      key: 'comment',
      icon: <MessageCircle size={21} color="#FFFFFF" strokeWidth={2} />,
      label: commentCount,
      a11y: t('decouvrir.card.comment'),
      onPress: onComment,
      bg: 'rgba(0,0,0,0.4)',
    },
    {
      key: 'share',
      icon: <Share2 size={20} color="#FFFFFF" strokeWidth={2} />,
      label: '',
      a11y: t('decouvrir.card.share'),
      onPress: onShare,
      bg: 'rgba(0,0,0,0.4)',
    },
    {
      key: 'more',
      icon: <MoreHorizontal size={21} color="#FFFFFF" strokeWidth={2} />,
      label: '',
      a11y: 'Options',
      onPress: onMore,
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
          accessibilityLabel={it.a11y}
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
          {it.label ? (
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
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

export function DiscoverEnd({ onRefresh }: { onRefresh: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { width: winW, height: winH } = useWindowDimensions();
  return (
    <View
      style={{
        width: Math.min(winW, CARD_MAX_W),
        height: winH,
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
          color: colors.text,
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
          color: colors.textMuted,
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
          backgroundColor: colors.text,
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RotateCcw size={15} color={colors.bg} strokeWidth={2.25} />
        <Text style={{ color: colors.bg, fontWeight: '700', fontSize: 14 }}>{t('decouvrir.card.endCta')}</Text>
      </Pressable>
    </View>
  );
}
