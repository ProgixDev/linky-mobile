import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { NetworkStateType, addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import { HOME_HERO_AUTOPLAY_ENABLED } from '../../lib/flags';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Play } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';
import { formatGNF } from '../../lib/format';
import { priceWithFeeGnf } from '../../lib/fees';
import { listingScope } from '../../lib/persona';
import { useAuth } from '../../stores/auth';
import { usePrefs } from '../../stores/prefs';
import { useDiscoverFeed } from '../../data/queries';
import type { DiscoverItem } from '../../data/types';

/**
 * LE CARROUSEL EN TÊTE DE L'ACCUEIL (client 2026-10-25) : « des short vidéos et
 * images avec un bouton "Publier maintenant" ». Le bouton a été RETIRÉ le
 * 2026-10-26 à la demande du développeur (Achraf) ; le client l'avait demandé,
 * à lui confirmer.
 *
 * Le contenu vient des VRAIES annonces, par le fil Découvrir : il exclut déjà
 * les utilisateurs bloqués, et le 2026-10-26, 8 articles et 3 biens en ligne
 * avaient une vidéo. Rien à saisir ailleurs, rien qui devienne périmé.
 *
 * ┌─ LA RÈGLE DE LA 3G ─────────────────────────────────────────────────────┐
 * Une vidéo qui démarre seule sur la première page consomme le forfait de
 * quelqu'un qui n'a rien demandé. Donc :
 *   - lecture automatique UNIQUEMENT en wifi (ou filaire), toujours muette ;
 *   - sur données mobiles, une image fixe et une icône lecture : toucher
 *     ouvre l'annonce, où la vidéo se lit à la demande ;
 *   - un seul lecteur à la fois, celui de la diapositive visible. Les autres
 *     ne chargent rien.
 * Un réseau encore inconnu au démarrage compte comme NON wifi : dans le doute,
 * on n'entame pas le forfait. Et l'Économiseur de données (Réglages) coupe la
 * lecture automatique partout, wifi compris — comme sur le fil Découvrir.
 * └─────────────────────────────────────────────────────────────────────────┘
 */

const GAP = 12;
const SLIDE_W = Math.min(Dimensions.get('window').width, 500) - 40;
const SLIDE_H = Math.round(SLIDE_W * 0.58);
const MAX_SLIDES = 6;
const MAX_VIDEOS = 3;
const DWELL_MS = 5000;
const DWELL_VIDEO_MS = 9000;
const ARM_DELAY_MS = 800;

interface Slide {
  key: string;
  kind: 'product' | 'property';
  id: string;
  title: string;
  price: string;
  photo: string | null;
  video: string | null;
}

function toSlide(d: DiscoverItem, perMonth: string, perDay: string, gift: string): Slide {
  if (d.kind === 'product') {
    const p = d.item;
    return {
      key: 'p' + p.id,
      kind: 'product',
      id: p.id,
      title: p.title,
      price: p.isGift ? gift : formatGNF(priceWithFeeGnf(p.priceGnf)),
      photo: p.photos?.[0] ?? null,
      video: p.videoUrl ?? null,
    };
  }
  const p = d.item;
  const suffix = p.type === 'location' ? (p.perMonth ? perMonth : perDay) : '';
  return {
    key: 'b' + p.id,
    kind: 'property',
    id: p.id,
    title: p.title,
    price: formatGNF(priceWithFeeGnf(p.priceGnf)) + suffix,
    photo: p.photos?.[0] ?? null,
    video: p.videoUrl ?? null,
  };
}

/** Les vidéos d'abord (jusqu'à trois : c'est ce que le client a demandé de
 *  voir), puis les annonces avec photo. Une annonce sans photo ni vidéo n'a
 *  rien à montrer en grand. */
function pickSlides(items: Slide[]): Slide[] {
  const videos = items.filter((s) => s.video);
  const photos = items.filter((s) => !s.video && s.photo);
  const out = [...videos.slice(0, MAX_VIDEOS), ...photos];
  if (out.length < MAX_SLIDES) out.push(...videos.slice(MAX_VIDEOS));
  return out.slice(0, MAX_SLIDES);
}

export function HomeHero() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const roles = useAuth((s) => s.roles);
  const scope = listingScope(roles);
  const filter = scope === 'products' ? 'products' : scope === 'properties' ? 'properties' : 'all';
  const { data, isLoading } = useDiscoverFeed(filter);

  const onNetworkWifi = useOnWifi(HOME_HERO_AUTOPLAY_ENABLED);
  // L'Économiseur de données l'emporte sur le wifi : quelqu'un qui l'a activé
  // a dit qu'il ne voulait pas de vidéo qui se lance seule, point.
  const dataSaver = usePrefs((s) => s.dataSaver);
  // L'accueil doit être À L'ÉCRAN : un lecteur qui continue de tourner quand on
  // est passé sur Découvrir (qui a ses propres lecteurs) consomme pour rien.
  const focused = useIsFocused();
  const onWifi = !dataSaver && onNetworkWifi && focused;

  const slides = useMemo(
    () =>
      pickSlides(
        (data ?? []).map((d) => toSlide(d, t('home.perMonth'), t('home.perDay'), t('create.giftBadge'))),
      ),
    [data, t],
  );

  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Défilement automatique. Suspendu pendant que la personne fait glisser, et
  // plus long sur une vidéo qui se lit : la couper à cinq secondes la rendrait
  // illisible.
  useEffect(() => {
    if (slides.length < 2 || dragging) return;
    const playing = !!slides[index]?.video && onWifi;
    const timer = setTimeout(() => {
      const next = (index + 1) % slides.length;
      scrollRef.current?.scrollTo({ x: next * (SLIDE_W + GAP), animated: true });
      setIndex(next);
    }, playing ? DWELL_VIDEO_MS : DWELL_MS);
    return () => clearTimeout(timer);
  }, [index, slides, dragging, onWifi]);

  // Si la liste rétrécit (filtre de persona, actualisation), ne pas rester sur
  // un indice qui n'existe plus.
  useEffect(() => {
    if (index >= slides.length && slides.length > 0) setIndex(0);
  }, [slides.length, index]);


  if (isLoading) {
    return (
      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ width: SLIDE_W, height: SLIDE_H, borderRadius: 22, backgroundColor: colors.bgSunken }} />
      </View>
    );
  }

  // Aucune annonce à montrer : une diapositive de marque plutôt qu'un vide.
  if (slides.length === 0) {
    return (
      <View style={{ paddingHorizontal: 20 }}>
        <View
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            borderRadius: 22,
            backgroundColor: colors.primary,
            padding: 20,
            justifyContent: 'center',
          }}
        >
          <View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFFFFF', lineHeight: 27 }}>
              {t('home.heroEmptyTitle')}
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>
              {t('home.heroEmptySub')}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SLIDE_W + GAP}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 20, gap: GAP }}
        onScrollBeginDrag={() => setDragging(true)}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / (SLIDE_W + GAP));
          setIndex(Math.max(0, Math.min(slides.length - 1, i)));
          setDragging(false);
        }}
      >
        {slides.map((s, i) => (
          <HeroSlide key={s.key} slide={s} active={i === index} canPlay={onWifi} />
        ))}
      </ScrollView>

      {slides.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={{
                width: i === index ? 18 : 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: i === index ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function HeroSlide({ slide, active, canPlay }: { slide: Slide; active: boolean; canPlay: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Un lecteur n'existe QUE pour la diapositive visible, et seulement en wifi.
  const wantsPlay = !!slide.video && canPlay && active;
  // ... et seulement après qu'elle est restée visible un instant : sans ce délai,
  // chaque glissement et chaque défilement automatique créerait puis détruirait
  // un lecteur natif. C'est l'un des scénarios suspects de l'écran gris du
  // 2026-10-26 ; on ne lui laisse pas l'occasion de se produire.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!wantsPlay) {
      setArmed(false);
      return;
    }
    const timer = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [wantsPlay]);
  const playHere = wantsPlay && armed;

  return (
    <Pressable
      onPress={() => {
        haptic.light();
        router.push(slide.kind === 'product' ? `/product/${slide.id}` : `/property/${slide.id}`);
      }}
      accessibilityLabel={`${slide.title}, ${slide.price}`}
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: '#0E1311',
      }}
    >
      {playHere ? (
        <HeroVideo uri={slide.video as string} />
      ) : slide.photo ? (
        <Image source={{ uri: slide.photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : null}

      {/* Sur données mobiles, une vidéo ne se lit pas : on le dit avec une
          icône plutôt que de laisser croire à une simple photo. */}
      {!!slide.video && !playHere && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Play size={20} color="#FFFFFF" fill="#FFFFFF" />
          </View>
        </View>
      )}

      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(0,0,0,0.72)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: SLIDE_H * 0.6 }}
      />

      <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: slide.video ? colors.primary : 'rgba(255,255,255,0.22)',
            marginBottom: 6,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 }}>
            {slide.video ? t('home.heroVideoBadge') : t('home.heroNewBadge')}
          </Text>
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF' }} numberOfLines={1}>
          {slide.title}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent, marginTop: 2 }} numberOfLines={1}>
          {slide.price}
        </Text>
      </View>
    </Pressable>
  );
}

function HeroVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
  });
  useEffect(() => {
    player.play();
    return () => {
      player.pause();
    };
  }, [player]);
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

/**
 * Vrai seulement en wifi (ou filaire). Tant que `enabled` est faux, AUCUN appel
 * au module réseau natif — ni lecture, ni écoute : c'est tout l'objet de
 * l'interrupteur, après l'écran gris du 2026-10-26.
 */
function useOnWifi(enabled: boolean): boolean {
  const [wifi, setWifi] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const apply = (type?: NetworkStateType) =>
      alive && setWifi(type === NetworkStateType.WIFI || type === NetworkStateType.ETHERNET);
    getNetworkStateAsync().then((s) => apply(s.type)).catch(() => apply(undefined));
    const sub = addNetworkStateListener((s) => apply(s.type));
    return () => {
      alive = false;
      sub.remove();
    };
  }, [enabled]);
  return wifi;
}
