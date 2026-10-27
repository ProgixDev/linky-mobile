import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Linking, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { NetworkStateType, addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import { HOME_HERO_AUTOPLAY_ENABLED } from '../../lib/flags';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Play, Plus } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';
import { formatGNF } from '../../lib/format';
import { priceWithFeeGnf } from '../../lib/fees';
import { listingScope } from '../../lib/persona';
import { useAuth } from '../../stores/auth';
import { usePrefs } from '../../stores/prefs';
import { useAppStats, useDiscoverFeed, useHomePromos } from '../../data/queries';
import type { AppStats, HomePromo } from '../../data/queries';
import type { DiscoverItem } from '../../data/types';

/**
 * LE CARROUSEL EN TÊTE DE L'ACCUEIL.
 *
 * 2026-10-27, le client, capture à l'appui : « c'est là que je veux qu'on
 * remplace par des chiffres clés de l'appli et des vidéos de publicité ».
 * Ordre des diapositives :
 *   1. « Linky en chiffres » (app-stats) — seulement les chiffres non nuls ;
 *   2. les vidéos de pub (home_promos, gérées côté serveur) ;
 *   3. TANT QU'AUCUNE PUB N'EXISTE, les annonces en remplacement, pour que le
 *      carrousel ne se réduise pas à une seule carte. Elles disparaissent
 *      d'elles-mêmes dès la première pub ajoutée.
 *
 * Historique : 2026-10-25, « des short vidéos et images avec un bouton
 * "Publier maintenant" ». Le bouton a été RETIRÉ le
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

/** Une diapositive « image ou vidéo » : une annonce, ou une pub. */
interface MediaSlide {
  type: 'media';
  key: string;
  title: string;
  /** Le prix d'une annonce, le sous-titre d'une pub. */
  caption: string | null;
  photo: string | null;
  video: string | null;
  badge: 'video' | 'new' | null;
  onOpen: (() => void) | null;
}

type Slide = MediaSlide | { type: 'stats'; key: 'stats' };

function listingSlide(d: DiscoverItem, perMonth: string, perDay: string, gift: string): MediaSlide {
  if (d.kind === 'product') {
    const p = d.item;
    return {
      type: 'media',
      key: 'p' + p.id,
      title: p.title,
      caption: p.isGift ? gift : formatGNF(priceWithFeeGnf(p.priceGnf)),
      photo: p.photos?.[0] ?? null,
      video: p.videoUrl ?? null,
      badge: p.videoUrl ? 'video' : 'new',
      onOpen: () => router.push(`/product/${p.id}`),
    };
  }
  const p = d.item;
  const suffix = p.type === 'location' ? (p.perMonth ? perMonth : perDay) : '';
  return {
    type: 'media',
    key: 'b' + p.id,
    title: p.title,
    caption: formatGNF(priceWithFeeGnf(p.priceGnf)) + suffix,
    photo: p.photos?.[0] ?? null,
    video: p.videoUrl ?? null,
    badge: p.videoUrl ? 'video' : 'new',
    onOpen: () => router.push(`/property/${p.id}`),
  };
}

function promoSlide(p: HomePromo): MediaSlide {
  const link = p.linkUrl?.trim() || null;
  let onOpen: (() => void) | null = null;
  // Un chemin de l'app s'ouvre dans l'app ; une adresse web dans le navigateur ;
  // sans lien, la pub se regarde simplement.
  if (link && link.startsWith('/')) onOpen = () => router.push(link as never);
  else if (link && /^https?:[/][/]/i.test(link)) onOpen = () => void Linking.openURL(link);
  return {
    type: 'media',
    key: 'ad' + p.id,
    title: p.title ?? '',
    caption: p.subtitle,
    photo: p.posterUrl,
    video: p.videoUrl,
    badge: p.videoUrl ? 'video' : null,
    onOpen,
  };
}

/** Les chiffres à montrer : uniquement ceux qui existent ET ne valent pas zéro.
 *  « 0 vente » sur la première page desservirait l'application. */
function statFigures(st: AppStats | undefined, t: (k: string) => string) {
  if (!st) return [];
  const all: { value: number | null | undefined; label: string }[] = [
    { value: st.listings, label: t('home.statsListings') },
    { value: st.shops, label: t('home.statsShops') },
    { value: st.cities, label: t('home.statsCities') },
    { value: st.users, label: t('home.statsUsers') },
    { value: st.sales, label: t('home.statsSales') },
    { value: st.bookings, label: t('home.statsBookings') },
  ];
  return all.filter((f): f is { value: number; label: string } => typeof f.value === 'number' && f.value > 0);
}

/** Les vidéos d'abord (jusqu'à trois : c'est ce que le client a demandé de
 *  voir), puis les annonces avec photo. Une annonce sans photo ni vidéo n'a
 *  rien à montrer en grand. */
function pickSlides(items: MediaSlide[]): MediaSlide[] {
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
  const { data } = useDiscoverFeed(filter);
  const promosQuery = useHomePromos();
  const { data: stats } = useAppStats();

  const onNetworkWifi = useOnWifi(HOME_HERO_AUTOPLAY_ENABLED);
  // L'Économiseur de données l'emporte sur le wifi : quelqu'un qui l'a activé
  // a dit qu'il ne voulait pas de vidéo qui se lance seule, point.
  const dataSaver = usePrefs((s) => s.dataSaver);
  // L'accueil doit être À L'ÉCRAN : un lecteur qui continue de tourner quand on
  // est passé sur Découvrir (qui a ses propres lecteurs) consomme pour rien.
  const focused = useIsFocused();
  const onWifi = !dataSaver && onNetworkWifi && focused;

  const figures = useMemo(() => statFigures(stats, t), [stats, t]);

  const slides = useMemo((): Slide[] => {
    const promos = promosQuery.data ?? [];
    const media =
      promos.length > 0
        ? promos.map(promoSlide)
        : pickSlides(
            (data ?? []).map((d) => listingSlide(d, t('home.perMonth'), t('home.perDay'), t('create.giftBadge'))),
          );
    const head: Slide[] = figures.length > 0 ? [{ type: 'stats', key: 'stats' }] : [];
    return [...head, ...media];
  }, [promosQuery.data, data, figures.length, t]);

  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Défilement automatique. Suspendu pendant que la personne fait glisser, et
  // plus long sur une vidéo qui se lit : la couper à cinq secondes la rendrait
  // illisible.
  useEffect(() => {
    if (slides.length < 2 || dragging) return;
    const cur = slides[index];
    const playing = cur?.type === 'media' && !!cur.video && onWifi;
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


  // « Publier maintenant » — REMIS le 2026-10-27 : le client l'a redemandé
  // (« un seul écran qui défile les stats et plusieurs vidéos/images avec le
  // bouton Publier maintenant »), après son retrait du 2026-10-26.
  // /create ne propose que ce que le rôle permet, et invite un simple acheteur
  // à activer un rôle : un seul point d'entrée, la règle reste au même endroit.
  const publish = () => {
    haptic.light();
    router.push('/create');
  };

  // On attend les pubs, pas le reste : ce sont elles qui décident du contenu.
  if (promosQuery.isLoading) {
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
            <View style={{ marginTop: 14 }}>
              <PublishButton onPress={publish} label={t('home.heroPublishNow')} />
            </View>
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
        {slides.map((s, i) =>
          s.type === 'stats' ? (
            <StatsSlide key={s.key} figures={figures} />
          ) : (
            <HeroSlide key={s.key} slide={s} active={i === index} canPlay={onWifi} />
          ),
        )}
      </ScrollView>

      {/* Le bouton ne défile PAS avec les diapositives : il reste au même
          endroit, quelle que soit la diapositive affichée. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', right: 34, top: 14 }}>
        <PublishButton onPress={publish} label={t('home.heroPublishNow')} />
      </View>

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

function PublishButton({ onPress, label }: { onPress: () => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: colors.accent,
      }}
    >
      <Plus size={15} color="#1A1405" strokeWidth={2.5} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1405' }}>{label}</Text>
    </Pressable>
  );
}

function HeroSlide({ slide, active, canPlay }: { slide: MediaSlide; active: boolean; canPlay: boolean }) {
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
        if (!slide.onOpen) return;
        haptic.light();
        slide.onOpen();
      }}
      disabled={!slide.onOpen}
      accessibilityLabel={slide.caption ? `${slide.title}, ${slide.caption}` : slide.title}
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
        {slide.badge && (
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: slide.badge === 'video' ? colors.primary : 'rgba(255,255,255,0.22)',
              marginBottom: 6,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 }}>
              {slide.badge === 'video' ? t('home.heroVideoBadge') : t('home.heroNewBadge')}
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF' }} numberOfLines={1}>
          {slide.title}
        </Text>
        {!!slide.caption && (
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent, marginTop: 2 }} numberOfLines={1}>
            {slide.caption}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** « Linky en chiffres » : jusqu'à six chiffres, trois par rangée. */
function StatsSlide({ figures }: { figures: { value: number; label: string }[] }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${t('home.statsTitle')} : ${figures.map((f) => `${f.value} ${f.label}`).join(', ')}`}
      style={{ width: SLIDE_W, height: SLIDE_H, borderRadius: 22, overflow: 'hidden' }}
    >
      <LinearGradient
        colors={[colors.primary, '#0B4A38']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
        {/* Moitié de la largeur au plus : le bouton « Publier maintenant » occupe
            le coin haut droit. */}
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF', maxWidth: '50%' }} numberOfLines={2}>
          {t('home.statsTitle')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
          {figures.map((f) => (
            <View key={f.label} style={{ width: '33.3%', paddingRight: 8 }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: '#FFFFFF' }}>{groupDigits(f.value)}</Text>
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.82)', marginTop: 2 }} numberOfLines={2}>
                {f.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** 12 400 plutôt que 12400, écrit à la main : le moteur JavaScript d'Android
 *  n'embarque pas toujours les données de langue de toLocaleString. */
function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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
