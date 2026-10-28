import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Linking,
  PixelRatio,
  Pressable,
  ScrollView,
  View,
  type AccessibilityRole,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { NetworkStateType, addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import { HOME_HERO_AUTOPLAY_ENABLED } from '../../lib/flags';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ArrowRight, Play } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';
import { formatGNF } from '../../lib/format';
import { priceWithFeeGnf } from '../../lib/fees';
import { canBuy, listingScope, type ListingScope } from '../../lib/persona';
import { useAuth } from '../../stores/auth';
import { useFilters } from '../../stores/filters';
import { hiddenKeyOf, useHiddenListings } from '../../stores/hiddenListings';
import { usePrefs } from '../../stores/prefs';
import {
  useAppStats,
  useDiscoverFeed,
  useHomePromos,
  useMyShopIds,
  useNearbyProperties,
  usePopularProducts,
} from '../../data/queries';
import type { AppStats, HomePromo } from '../../data/queries';
import type { DiscoverItem } from '../../data/types';

/**
 * LE CARROUSEL EN TÊTE DE L'ACCUEIL — calqué sur la maquette TechHub du client.
 *
 * Ce que le client a demandé, dans l'ordre :
 *   2026-10-25  « ce type de tableau de bord » (maquette TechHub) : « des short
 *               vidéos et images avec un bouton "Publier maintenant". Aussi les
 *               statistiques : nombre d'utilisateurs, nombre d'annonces en
 *               ligne, nombre de ventes et de réservations réalisées ».
 *   2026-10-27  sur une capture du carrousel, qui montrait alors des annonces :
 *               « c'est là que je veux qu'on remplace par des chiffres clés de
 *               l'appli et des vidéos de publicité » ; puis « un seul écran qui
 *               diffuse/défile les stats de l'appli et plusieurs vidéos/images
 *               avec le bouton Publier maintenant ».
 *
 * D'où, depuis le 2026-10-28 :
 *   1. « Linky en chiffres » : SES quatre chiffres, dans SON ordre (app-stats).
 *   2. Puis, en alternance, des IMAGES et des VIDÉOS :
 *      - les images = ses pubs (home_promos, gérées côté serveur) ou, tant
 *        qu'il n'en a envoyé aucune, des pubs Linky intégrées sur de vrais
 *        atouts de l'app (publier gratuitement, paiement protégé, logements) ;
 *      - les vidéos = les vraies vidéos des annonces (jusqu'à trois). Décision
 *        d'Achraf le 2026-10-28, faute de vidéos de pub du client : « pour les
 *        vidéos, on a déjà les vidéos des produits ». Ses pubs passent d'abord :
 *        les vidéos d'annonces ne prennent que les places restantes.
 *
 * Mise en page de la maquette : accroche, titre sur deux lignes dont la seconde
 * en couleur, sous-titre, puis le bouton EN BAS À GAUCHE avec sa flèche (à la
 * place de « SHOP NOW → »), et les points de défilement DANS la bannière.
 * Le bouton et les points ne défilent pas : ils restent posés sur la bannière,
 * quelle que soit la diapositive affichée — « un seul écran ».
 *
 * Les vidéos d'annonces sont VERTICALES (les 11 en ligne le 2026-10-28,
 * filmées au téléphone) : en plein cadre paysage, on n'en voyait que 30 à 40 %.
 * Elles passent dans un cadre portrait à droite — comme l'image produit de la
 * maquette — qui en montre 75 à 90 %.
 *
 * ┌─ LE FORMAT D'UNE PUB (home_promos) ─────────────────────────────────────┐
 * Une pub, elle, occupe toute la bannière, PAYSAGE (environ 1,6 : 1), remplie
 * en « cover ». Demander au client :
 *   - vidéo paysage 16:10 (1280 × 800), 15 à 30 s, compressée (3G), sans son
 *     indispensable — elle est lue muette ;
 *   - TOUJOURS une affiche (poster_url, même cadrage ; la base l'exige depuis
 *     la migration 20261028_01) : c'est elle qu'on voit hors wifi ;
 *   - le coin bas-gauche libre : le bouton « Publier maintenant » s'y pose.
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LA RÈGLE DE LA 3G ─────────────────────────────────────────────────────┐
 * Une vidéo qui démarre seule sur la première page consomme le forfait de
 * quelqu'un qui n'a rien demandé. Donc :
 *   - lecture automatique UNIQUEMENT en wifi (ou filaire), toujours muette, et
 *     pas du tout en production tant que HOME_HERO_AUTOPLAY_ENABLED le dit ;
 *   - sinon, l'image et un bouton lecture : la vidéo ne se lit que si on la
 *     DEMANDE d'un appui. Un second appui ouvre l'annonce (ou le lien de la pub) ;
 *   - un seul lecteur à la fois, celui de la diapositive visible. Les autres
 *     ne chargent rien. Quitter l'accueil arrête la vidéo demandée.
 * Un réseau encore inconnu au démarrage compte comme NON wifi : dans le doute,
 * on n'entame pas le forfait. Et l'Économiseur de données (Réglages) coupe la
 * lecture automatique partout, wifi compris — comme sur le fil Découvrir.
 * Une vidéo passe à la diapositive suivante à SA fin. Lancée seule, une vidéo
 * d'annonce (souvent longue) cède la place au bout de 15 s ; demandée d'un
 * appui, elle va jusqu'au bout.
 * └─────────────────────────────────────────────────────────────────────────┘
 */

const GAP = 12;
const SLIDE_W = Math.min(Dimensions.get('window').width, 500) - 40;
/** Marge intérieure d'une diapositive. */
const PAD = 16;
/** Le bouton, posé au-dessus de la rangée de points. */
const CTA_H = 34;
const CTA_BOTTOM = 24;
const DOTS_BOTTOM = 10;
/** La bande du bas qui leur est réservée : aucun texte n'y descend. */
const CTA_BAND = CTA_BOTTOM + CTA_H + 8;
/** Les textes de la bannière grandissent avec la taille de police du système,
 *  mais pas au point de sortir d'une bannière de hauteur fixe. */
const MAX_FONT_SCALE = 1.15;
const FONT_SCALE = Math.min(PixelRatio.getFontScale(), MAX_FONT_SCALE);
/** La plus haute des diapositives est celle des chiffres : accroche (14) et deux
 *  rangées de chiffre (27) + libellé (14), plus ses marges fixes (10 + 6). */
const STATS_TEXT_H = 14 + 2 * (27 + 14);
const STATS_GAPS = 10 + 6;
/** 0,62 de la largeur… mais jamais moins que ce qu'il faut à ce texte, à la
 *  taille de police du téléphone, au-dessus de la bande du bouton : sur un
 *  écran de 320 dp, ou en police « Grande », le bouton recouvrait sinon la
 *  seconde rangée de chiffres. */
const SLIDE_H = Math.max(
  Math.round(SLIDE_W * 0.62),
  Math.ceil(PAD + STATS_TEXT_H * FONT_SCALE + STATS_GAPS + CTA_BAND),
);
/** Le texte d'une diapositive s'arrête au-dessus du bouton. */
const CONTENT_H = SLIDE_H - PAD - CTA_BAND;
/** La colonne de texte d'une pub : la photo occupe le reste, à droite. */
const AD_TEXT_W = Math.round(SLIDE_W * 0.64) - PAD;
/** Le cadre portrait d'une vidéo d'annonce, à droite, et la colonne de texte
 *  qui le borde sans le chevaucher. */
const LISTING_MEDIA_W = Math.round(SLIDE_W * 0.46);
const LISTING_TEXT_W = SLIDE_W - LISTING_MEDIA_W - PAD - 8;
/** Le fond sombre des pubs (l'« encre » de la charte), et le texte posé sur l'or. */
const INK = '#0E1311';
const ON_GOLD = '#1A1405';
const DWELL_MS = 6000;
/** Une vidéo LANCÉE SEULE passe à la suivante à sa fin (playToEnd) ; ces délais
 *  ne sont que des filets. Une pub dure 15 à 30 s ; une vidéo d'annonce peut
 *  durer bien plus, on ne la laisse pas confisquer le carrousel. */
const PROMO_VIDEO_MAX_MS = 35000;
const LISTING_VIDEO_MAX_MS = 15000;
const ARM_DELAY_MS = 800;
/** Jusqu'à trois vidéos d'annonces, et au plus six diapositives après les
 *  chiffres — sauf si le client a envoyé plus de pubs : les siennes passent
 *  toutes, les vidéos d'annonces n'ont que les places restantes. */
const MAX_LISTING_VIDEOS = 3;
const MAX_MEDIA = 6;

// ---- Les pubs intégrées --------------------------------------------------

type BrandAdId = 'sell' | 'protected' | 'homes' | 'rentOut';

/** Le préfixe des clés de traduction : home.ad<Nom>Eyebrow / Title1 / Title2 / Sub. */
const AD_KEY: Record<BrandAdId, string> = {
  sell: 'home.adSell',
  protected: 'home.adProtected',
  homes: 'home.adHomes',
  rentOut: 'home.adRentOut',
};

/**
 * Quelles pubs pour quel compte. Deux questions distinctes (src/lib/persona.ts) :
 *   - ce que le compte PEUT PUBLIER décide de la pub « publier ». /create ne
 *     propose les articles qu'au vendeur et les biens qu'à l'agence : promettre
 *     « tes articles » à une agence l'enverrait sur un choix qui ne les offre
 *     pas. Un acheteur simple reçoit l'invitation aux articles, et /create lui
 *     propose d'activer un rôle ;
 *   - ce que le compte PEUT ACHETER décide des pubs côté acheteur (paiement
 *     protégé, logements à louer) : un professionnel sans le rôle acheteur ne
 *     commande ni ne loue (canBuy). Et chacune reste dans la catégorie que le
 *     compte voit.
 */
function brandAds(roles: string[], scope: ListingScope): BrandAdId[] {
  const publish: BrandAdId[] = [];
  if (roles.includes('seller')) publish.push('sell');
  if (roles.includes('agent')) publish.push('rentOut');
  if (publish.length === 0) publish.push('sell');
  if (!canBuy(roles)) return publish;
  const buyerSide: BrandAdId[] = [];
  if (scope !== 'properties') buyerSide.push('protected');
  if (scope !== 'products') buyerSide.push('homes');
  return [...publish, ...buyerSide];
}

/** Une diapositive vidéo : une annonce qui a une vidéo, ou une pub du client. */
interface VideoSlide {
  type: 'listing' | 'promo';
  key: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  /** Ce que lit le lecteur d'écran à la place du sous-titre : « par jour »
   *  plutôt que « barre oblique jour ». */
  subtitleA11y: string | null;
  /** Le prix d'une annonce s'écrit en or, le sous-titre d'une pub en blanc. */
  subtitleGold: boolean;
  poster: string | null;
  video: string | null;
  onOpen: (() => void) | null;
}

type Slide =
  | { type: 'stats'; key: 'stats' }
  | { type: 'ad'; key: string; id: BrandAdId; photo: string | null; onOpen: (() => void) | null }
  | VideoSlide;

function promoSlide(p: HomePromo): VideoSlide {
  const link = p.linkUrl?.trim() || null;
  // Un chemin de l'app s'ouvre dans l'app ; une adresse web dans le navigateur ;
  // sans lien, la pub se regarde simplement.
  let onOpen: (() => void) | null = null;
  if (link && link.startsWith('/')) onOpen = () => router.push(link as never);
  else if (link && /^https?:[/][/]/i.test(link)) onOpen = () => void Linking.openURL(link);
  const subtitle = p.subtitle?.trim() || null;
  return {
    type: 'promo',
    key: 'ad' + p.id,
    eyebrow: null,
    title: p.title?.trim() ?? '',
    subtitle,
    subtitleA11y: subtitle,
    subtitleGold: false,
    poster: p.posterUrl,
    video: p.videoUrl,
    onOpen,
  };
}

interface ListingLabels {
  eyebrow: string;
  perMonth: string;
  perDay: string;
  perMonthA11y: string;
  perDayA11y: string;
  gift: string;
}

/** Une annonce QUI A UNE VIDÉO, sinon null : les autres ont leurs rangées sous
 *  le carrousel. Le prix affiché est celui que paie l'acheteur, comme partout. */
function listingVideoSlide(d: DiscoverItem, labels: ListingLabels): VideoSlide | null {
  if (!d.item.videoUrl) return null;
  if (d.kind === 'product') {
    const p = d.item;
    const price = p.isGift ? labels.gift : formatGNF(priceWithFeeGnf(p.priceGnf));
    return {
      type: 'listing',
      key: 'p' + p.id,
      eyebrow: labels.eyebrow,
      title: p.title,
      subtitle: price,
      subtitleA11y: price,
      subtitleGold: true,
      poster: p.photos?.[0] ?? null,
      video: p.videoUrl ?? null,
      onOpen: () => router.push(`/product/${p.id}`),
    };
  }
  const p = d.item;
  const price = formatGNF(priceWithFeeGnf(p.priceGnf));
  const rent = p.type === 'location';
  return {
    type: 'listing',
    key: 'b' + p.id,
    eyebrow: labels.eyebrow,
    title: p.title,
    subtitle: price + (rent ? (p.perMonth ? labels.perMonth : labels.perDay) : ''),
    subtitleA11y: price + (rent ? ' ' + (p.perMonth ? labels.perMonthA11y : labels.perDayA11y) : ''),
    subtitleGold: true,
    poster: p.photos?.[0] ?? null,
    video: p.videoUrl ?? null,
    onOpen: () => router.push(`/property/${p.id}`),
  };
}

/** Image, vidéo, image, vidéo… : le client a demandé « plusieurs vidéos/images ».
 *  Les IMAGES d'abord : la diapositive qui suit les chiffres ne dépend pas du
 *  fil des vidéos, qui peut arriver plus tard. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

function sameKeys(a: { key: string }[], b: { key: string }[]): boolean {
  return a.length === b.length && a.every((s, i) => s.key === b[i].key);
}

function openPublish() {
  haptic.light();
  // /create ne propose que ce que le rôle permet, et invite un simple acheteur
  // à activer un rôle : un seul point d'entrée, la règle reste au même endroit.
  router.push('/create');
}

function openRentals() {
  haptic.light();
  const f = useFilters.getState();
  f.setMarcheTab('immobilier');
  f.setPropertyType('location');
  router.push('/(tabs)/marche');
}

/** Les quatre chiffres du client, dans son ordre. Un chiffre absent ou nul ne
 *  s'affiche pas : « 0 vente » sur la première page desservirait l'app. */
function statFigures(st: AppStats | undefined, t: (k: string) => string) {
  if (!st) return [];
  const all: { value: number | null | undefined; label: string }[] = [
    { value: st.users, label: t('home.statsUsers') },
    { value: st.listings, label: t('home.statsListings') },
    { value: st.sales, label: t('home.statsSales') },
    { value: st.bookings, label: t('home.statsBookings') },
  ];
  return all.filter((f): f is { value: number; label: string } => typeof f.value === 'number' && f.value > 0);
}

export function HomeHero() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const roles = useAuth((s) => s.roles);
  const meId = useAuth((s) => s.user?.id ?? s.authUserId ?? undefined);
  const scope = listingScope(roles);
  const promosQuery = useHomePromos();
  const statsQuery = useAppStats();
  // Les vidéos d'annonces : le fil Découvrir, qui exclut déjà les comptes
  // bloqués, dans la catégorie que le compte voit.
  const { data: feed } = useDiscoverFeed(scope === 'both' ? 'all' : scope);
  const myShopIds = useMyShopIds();
  const hiddenKeys = useHiddenListings((s) => s.keys);
  // Les photos des pubs intégrées viennent des MÊMES requêtes que les rangées de
  // l'accueil (mêmes clés, mêmes conditions) : aucun appel de plus, et des
  // photos déjà en cache. Une vraie annonce, jamais une image inventée.
  const { data: products } = usePopularProducts(4, scope !== 'properties');
  const { data: properties } = useNearbyProperties(3, scope !== 'products');

  const onNetworkWifi = useOnWifi(HOME_HERO_AUTOPLAY_ENABLED);
  // L'Économiseur de données l'emporte sur le wifi : quelqu'un qui l'a activé
  // a dit qu'il ne voulait pas de vidéo qui se lance seule, point.
  const dataSaver = usePrefs((s) => s.dataSaver);
  // L'accueil doit être À L'ÉCRAN : un lecteur qui continue de tourner quand on
  // est passé sur Découvrir (qui a ses propres lecteurs) consomme pour rien.
  const focused = useIsFocused();
  const canAutoplay = !dataSaver && onNetworkWifi && focused;
  // On attend les chiffres et les pubs : ensemble, ils décident de la tête du
  // carrousel. Des chiffres arrivés après coup s'inséreraient EN TÊTE, sous les
  // yeux de la personne. Le fil des vidéos, lui, n'est PAS attendu (plus lourd,
  // authentifié) : ses vidéos s'insèrent plus loin, voir `videos`. Une requête
  // en échec ne bloque rien : isLoading retombe, sa part manque, c'est tout.
  const loading = promosQuery.isLoading || statsQuery.isLoading;

  const figures = useMemo(() => statFigures(statsQuery.data, t), [statsQuery.data, t]);
  const ads = useMemo(() => brandAds(roles, scope), [roles, scope]);

  // Les vidéos d'annonces candidates, dans l'ordre du fil.
  const freshVideos = useMemo((): VideoSlide[] => {
    const labels: ListingLabels = {
      eyebrow: t('home.videoEyebrow'),
      perMonth: t('home.perMonth'),
      perDay: t('home.perDay'),
      perMonthA11y: t('home.perMonthA11y'),
      perDayA11y: t('home.perDayA11y'),
      gift: t('create.giftBadge'),
    };
    const out: VideoSlide[] = [];
    const seenSellers = new Set<string>();
    const seenVideos = new Set<string>();
    for (const d of feed ?? []) {
      if (out.length >= MAX_LISTING_VIDEOS) break;
      const video = d.item.videoUrl;
      if (!video || seenVideos.has(video)) continue;
      // Ce que la personne a masqué dans Découvrir ne revient pas ici.
      if (hiddenKeys.has(hiddenKeyOf(d.kind, d.item.id))) continue;
      // Ses propres annonces ne passent pas dans SON carrousel — même règle que
      // les rangées de l'accueil (usePopularProducts / useNearbyProperties).
      const own = d.kind === 'product' ? myShopIds.has(d.item.shopId) : !!meId && d.item.ownerId === meId;
      if (own) continue;
      // Une vidéo par vendeur : le même clip publié deux fois (deux annonces,
      // deux fichiers identiques) occupait deux places sur trois.
      const seller = d.kind === 'product' ? 'shop:' + d.item.shopId : 'owner:' + d.item.ownerId;
      if (seenSellers.has(seller)) continue;
      const slide = listingVideoSlide(d, labels);
      if (!slide) continue;
      seenSellers.add(seller);
      seenVideos.add(video);
      out.push(slide);
    }
    return out;
  }, [feed, hiddenKeys, myShopIds, meId, t]);

  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const endedWhileDraggingRef = useRef(false);
  // La vidéo qu'on a demandé de lire d'un appui (hors wifi) : la clé de SA
  // diapositive. Changer de diapositive, ou quitter l'accueil, l'arrête.
  const [userPlayKey, setUserPlayKey] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Les vidéos RETENUES. Elles se placent derrière la première diapositive :
  // on ne les ajoute (ou ne les change) que quand c'est elle qui est affichée,
  // ou quand l'accueil n'est pas à l'écran — jamais sous les yeux de quelqu'un
  // qui regarde la troisième.
  const [videos, setVideos] = useState<VideoSlide[]>(freshVideos);
  useEffect(() => {
    if (sameKeys(videos, freshVideos)) return;
    if (index === 0 || !focused || loading) setVideos(freshVideos);
  }, [freshVideos, videos, index, focused, loading]);

  const slides = useMemo((): Slide[] => {
    const head: Slide[] = figures.length > 0 ? [{ type: 'stats', key: 'stats' }] : [];
    const promos = promosQuery.data ?? [];
    let images: Slide[];
    if (promos.length > 0) {
      images = promos.map(promoSlide);
    } else {
      const productPhotos = (products ?? []).map((p) => p.photos?.[0]).filter((u): u is string => !!u);
      // Un logement À LOUER d'abord : c'est ce qu'annonce la pub « logements ».
      const propertyPhotos = [...(properties ?? [])]
        .sort((a, b) => Number(b.type === 'location') - Number(a.type === 'location'))
        .map((p) => p.photos?.[0])
        .filter((u): u is string => !!u);
      const photoFor: Record<BrandAdId, string | null> = {
        sell: productPhotos[0] ?? null,
        protected: productPhotos[1] ?? productPhotos[0] ?? null,
        homes: propertyPhotos[0] ?? null,
        rentOut: propertyPhotos[1] ?? propertyPhotos[0] ?? null,
      };
      const onOpenFor: Record<BrandAdId, (() => void) | null> = {
        sell: openPublish,
        // Aucune page n'explique le séquestre dans l'app : la pub se lit, elle
        // n'emmène nulle part plutôt que vers une page inventée.
        protected: null,
        homes: openRentals,
        rentOut: openPublish,
      };
      images = ads.map((id): Slide => ({ type: 'ad', key: 'brand-' + id, id, photo: photoFor[id], onOpen: onOpenFor[id] }));
    }
    // Les pubs du client d'abord ; les vidéos d'annonces prennent les places
    // restantes jusqu'à MAX_MEDIA.
    const budget = Math.max(0, Math.min(MAX_LISTING_VIDEOS, MAX_MEDIA - images.length));
    return [...head, ...interleave<Slide>(images, videos.slice(0, budget))];
  }, [figures.length, promosQuery.data, products, properties, ads, videos]);

  const goTo = useCallback((i: number) => {
    scrollRef.current?.scrollTo({ x: i * (SLIDE_W + GAP), animated: true });
    setIndex(i);
  }, []);

  const cur = slides[index];
  const curKey = cur?.key;
  useEffect(() => {
    setUserPlayKey(null);
  }, [curKey]);
  // Revenir sur l'accueil ne relance pas, toute seule, une vidéo demandée avant
  // d'en partir : hors wifi, ce serait retélécharger sans qu'on l'ait demandé.
  useEffect(() => {
    if (!focused) setUserPlayKey(null);
  }, [focused]);
  const curVideo = cur && (cur.type === 'listing' || cur.type === 'promo') && cur.video ? cur : null;
  const userPlaying = !!curVideo && userPlayKey === curVideo.key;
  const autoPlaying = !!curVideo && canAutoplay;
  const dwell = autoPlaying ? (curVideo?.type === 'listing' ? LISTING_VIDEO_MAX_MS : PROMO_VIDEO_MAX_MS) : DWELL_MS;

  // Défilement automatique. Rien pendant le chargement (l'indice avancerait
  // derrière le squelette, et la bannière apparaîtrait avec le mauvais point
  // allumé), rien quand l'accueil n'est pas à l'écran, rien pendant que la
  // personne fait glisser — ni pendant une vidéo qu'elle a DEMANDÉE : on ne
  // coupe pas ce qu'elle a choisi de regarder, sa fin fera avancer.
  useEffect(() => {
    if (loading || !focused || slides.length < 2 || dragging || userPlaying) return;
    const timer = setTimeout(() => goTo((index + 1) % slides.length), dwell);
    return () => clearTimeout(timer);
  }, [loading, focused, slides.length, dragging, userPlaying, index, dwell, goTo]);

  // La fin d'une vidéo fait avancer — sauf en plein glissement : on note, et
  // l'avance se fait au relâcher si la personne est restée sur la même.
  const onVideoEnd = useCallback(() => {
    if (draggingRef.current) {
      endedWhileDraggingRef.current = true;
      return;
    }
    if (slides.length > 1) goTo((index + 1) % slides.length);
  }, [slides.length, index, goTo]);

  // Si la liste rétrécit (une pub retirée, un changement de rôle), ne pas rester
  // sur un indice qui n'existe plus.
  useEffect(() => {
    if (index >= slides.length && slides.length > 0) {
      setIndex(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [slides.length, index]);

  if (loading) {
    return (
      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ width: SLIDE_W, height: SLIDE_H, borderRadius: 22, backgroundColor: colors.bgSunken }} />
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
        onScrollBeginDrag={() => {
          draggingRef.current = true;
          setDragging(true);
        }}
        onMomentumScrollEnd={(e) => {
          const i = Math.max(0, Math.min(slides.length - 1, Math.round(e.nativeEvent.contentOffset.x / (SLIDE_W + GAP))));
          const stayed = i === index;
          draggingRef.current = false;
          setDragging(false);
          if (endedWhileDraggingRef.current) {
            endedWhileDraggingRef.current = false;
            // La vidéo s'est terminée pendant le geste et la personne est restée
            // dessus : l'avance qu'on avait retenue se fait maintenant.
            if (stayed && slides.length > 1) {
              goTo((i + 1) % slides.length);
              return;
            }
          }
          setIndex(i);
        }}
      >
        {slides.map((s, i) => {
          if (s.type === 'stats') return <StatsSlide key={s.key} figures={figures} />;
          if (s.type === 'ad') return <AdSlide key={s.key} id={s.id} photo={s.photo} onOpen={s.onOpen} />;
          return (
            <VideoBannerSlide
              key={s.key}
              slide={s}
              active={i === index}
              focused={focused}
              canAutoplay={canAutoplay}
              userPlay={i === index && userPlayKey === s.key}
              onUserPlay={() => setUserPlayKey(s.key)}
              // Un appui sur la tranche d'une diapositive VOISINE l'amène à
              // l'écran ; il ne lance rien qu'on ne voit pas.
              onActivate={() => goTo(i)}
              onEnded={onVideoEnd}
              loop={slides.length < 2}
            />
          );
        })}
      </ScrollView>

      {/* « Publier maintenant », EN BAS À GAUCHE comme le « SHOP NOW → » de la
          maquette. Il ne défile pas avec les diapositives. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 20 + PAD, bottom: CTA_BOTTOM }}>
        <PublishButton onPress={openPublish} label={t('home.heroPublishNow')} />
      </View>

      {/* Les points DANS la bannière, sous le bouton, comme sur la maquette. Tous
          les fonds de diapositive sont sombres en bas : le blanc s'y lit. */}
      {slides.length > 1 && (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            left: 20,
            width: SLIDE_W,
            bottom: DOTS_BOTTOM,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={{
                width: i === index ? 16 : 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
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
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: CTA_H,
        paddingLeft: 16,
        paddingRight: 5,
        borderRadius: 999,
        backgroundColor: colors.accent,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        style={{ fontSize: 13.5, fontWeight: '800', color: ON_GOLD, letterSpacing: 0 }}
      >
        {label}
      </Text>
      <View
        style={{
          width: CTA_H - 10,
          height: CTA_H - 10,
          borderRadius: 999,
          backgroundColor: ON_GOLD,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArrowRight size={14} color={colors.accent} strokeWidth={2.5} />
      </View>
    </Pressable>
  );
}

/**
 * Le cadre d'une diapositive : un bouton s'il mène quelque part, sinon une
 * simple zone lisible. Un Pressable « disabled » serait annoncé « désactivé »
 * par TalkBack, juste après le message de la pub.
 */
function SlideFrame({
  onPress,
  label,
  role,
  style,
  children,
}: {
  onPress: (() => void) | null;
  label: string | undefined;
  role: AccessibilityRole;
  style: ViewStyle;
  children: ReactNode;
}) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={style}>
        {children}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityRole={role} accessibilityLabel={label} style={style}>
      {children}
    </View>
  );
}

/** L'accroche, en petites capitales, au-dessus du titre. Dorée sur l'encre ; sur
 *  le vert des chiffres, l'or n'a pas le contraste d'un texte de 11 px. */
function Eyebrow({ children, color }: { children: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      style={{
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '800',
        color: color ?? colors.accent,
        letterSpacing: 1.1,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

/** Une pub Linky intégrée : texte à gauche, vraie photo d'annonce à droite. */
function AdSlide({ id, photo, onOpen }: { id: BrandAdId; photo: string | null; onOpen: (() => void) | null }) {
  const { colors, theme } = useTheme();
  const { t } = useTranslation();
  const k = AD_KEY[id];
  const eyebrow = t(`${k}Eyebrow`);
  const title1 = t(`${k}Title1`);
  const title2 = t(`${k}Title2`);
  const sub = t(`${k}Sub`);
  return (
    <SlideFrame
      onPress={onOpen}
      // L'accroche EN TÊTE : c'est elle qui porte « Publier est gratuit ».
      label={`${eyebrow}. ${title1} ${title2} ${sub}`}
      role="text"
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        borderRadius: 22,
        overflow: 'hidden',
        // Un filet en mode sombre : sans lui, l'encre se fond dans le noir.
        borderWidth: theme === 'dark' ? 1 : 0,
        borderColor: colors.border,
      }}
    >
      <LinearGradient
        colors={[INK, '#0A3B2E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {photo && (
        <Image
          source={{ uri: photo }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '58%' }}
          contentFit="cover"
          transition={200}
        />
      )}
      {/* Le fondu qui rend le texte lisible : l'encre pleine sous la colonne de
          texte, la photo qui apparaît à droite. */}
      <LinearGradient
        pointerEvents="none"
        colors={[INK, 'rgba(14,19,17,0.82)', 'rgba(14,19,17,0)']}
        locations={[0.4, 0.55, 0.85]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(14,19,17,0)', 'rgba(14,19,17,0.7)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 }}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: PAD, left: PAD, width: AD_TEXT_W, maxHeight: CONTENT_H, overflow: 'hidden' }}
      >
        <Eyebrow>{eyebrow}</Eyebrow>
        <View style={{ marginTop: 6 }}>
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{ fontSize: 20, lineHeight: 24, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 }}
          >
            {title1}
          </Text>
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{ fontSize: 20, lineHeight: 24, fontWeight: '800', color: colors.accent, letterSpacing: -0.3 }}
          >
            {title2}
          </Text>
        </View>
        {/* Rétrécit plutôt que de finir en « … » : à 320 dp ou en police
            « Grande », deux lignes de 12,5 ne suffisent pas toujours. */}
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{ fontSize: 12.5, lineHeight: 16, color: 'rgba(255,255,255,0.78)', marginTop: 6, letterSpacing: 0 }}
        >
          {sub}
        </Text>
      </View>
    </SlideFrame>
  );
}

/**
 * Une diapositive vidéo. Deux mises en page :
 *   - une ANNONCE : sa vidéo (verticale, filmée au téléphone) dans un cadre
 *     portrait à droite, son titre et son prix à gauche ;
 *   - une PUB du client : son image ou sa vidéo (paysage) en plein cadre, son
 *     texte à gauche par-dessus.
 */
function VideoBannerSlide({
  slide,
  active,
  focused,
  canAutoplay,
  userPlay,
  onUserPlay,
  onActivate,
  onEnded,
  loop,
}: {
  slide: VideoSlide;
  active: boolean;
  focused: boolean;
  canAutoplay: boolean;
  userPlay: boolean;
  onUserPlay: () => void;
  onActivate: () => void;
  onEnded: () => void;
  loop: boolean;
}) {
  const { colors, theme } = useTheme();
  const { t } = useTranslation();
  const hasVideo = !!slide.video;
  const inset = slide.type === 'listing';
  // La lecture AUTOMATIQUE n'existe que pour la diapositive visible, en wifi…
  const wantsAuto = hasVideo && canAutoplay && active;
  // … et seulement après qu'elle est restée visible un instant : sans ce délai,
  // chaque glissement et chaque défilement automatique créerait puis détruirait
  // un lecteur natif.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!wantsAuto) {
      setArmed(false);
      return;
    }
    const timer = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [wantsAuto]);
  // Hors wifi, la vidéo se lit si on la DEMANDE d'un appui : la règle de la 3G
  // interdit la lecture qui se lance seule, pas celle qu'on réclame.
  const playHere = hasVideo && active && focused && (userPlay || (wantsAuto && armed));
  const { title, subtitle, eyebrow, onOpen } = slide;
  const hasText = !!eyebrow || !!title || !!subtitle;

  // Sur une voisine : l'amener à l'écran. Sur la diapositive affichée : lire la
  // vidéo tant qu'elle ne se lit pas, puis ouvrir l'annonce (ou le lien).
  const onPress = !active
    ? onActivate
    : hasVideo && !playHere
      ? () => {
          haptic.light();
          onUserPlay();
        }
      : onOpen
        ? () => {
            haptic.light();
            onOpen();
          }
        : null;
  const label =
    [title, slide.subtitleA11y, hasVideo && !playHere ? t('home.promoPlayA11y') : null].filter(Boolean).join(', ') ||
    undefined;

  const media = playHere ? (
    <HeroVideo uri={slide.video as string} loop={loop} onEnd={onEnded} />
  ) : slide.poster ? (
    <Image source={{ uri: slide.poster }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
  ) : null;

  return (
    <SlideFrame
      onPress={onPress}
      label={label}
      role="image"
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: INK,
        borderWidth: theme === 'dark' ? 1 : 0,
        borderColor: colors.border,
      }}
    >
      {inset ? (
        <>
          <LinearGradient
            colors={[INK, '#0A3B2E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: LISTING_MEDIA_W }}>{media}</View>
          {/* Le bord gauche du cadre se fond dans l'encre. */}
          <LinearGradient
            pointerEvents="none"
            colors={[INK, 'rgba(14,19,17,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', top: 0, bottom: 0, left: SLIDE_W - LISTING_MEDIA_W, width: 36 }}
          />
        </>
      ) : (
        <>
          {media}
          {/* Un fondu à gauche seulement s'il y a du texte à y poser : une pub
              sans texte se montre telle quelle. */}
          {hasText && (
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(14,19,17,0.78)', 'rgba(14,19,17,0)']}
              locations={[0.25, 0.75]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
          )}
        </>
      )}
      {/* En bas, toujours : le bouton et les points y sont posés. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(14,19,17,0)', 'rgba(14,19,17,0.7)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 72 }}
      />

      {/* Une vidéo qui ne se lit pas le dit : sans ce bouton, hors wifi, on ne
          verrait qu'une image sans savoir qu'il y a mieux. */}
      {hasVideo && !playHere && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: inset ? Math.round(LISTING_MEDIA_W / 2) - 23 : PAD + 6,
            top: Math.round((SLIDE_H - CTA_BAND) / 2) - 8,
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
      )}

      {hasText && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: PAD,
            left: PAD,
            width: inset ? LISTING_TEXT_W : AD_TEXT_W,
            maxHeight: CONTENT_H,
            overflow: 'hidden',
          }}
        >
          {!!eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          {!!title && (
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              numberOfLines={2}
              style={{
                fontSize: 20,
                lineHeight: 24,
                fontWeight: '800',
                color: '#FFFFFF',
                letterSpacing: -0.3,
                marginTop: eyebrow ? 6 : 0,
              }}
            >
              {title}
            </Text>
          )}
          {!!subtitle && (
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              numberOfLines={slide.subtitleGold ? 1 : 2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={
                slide.subtitleGold
                  ? { fontSize: 15, lineHeight: 19, fontWeight: '800', color: colors.accent, marginTop: 4, letterSpacing: 0 }
                  : { fontSize: 12.5, lineHeight: 16, color: 'rgba(255,255,255,0.82)', marginTop: 6, letterSpacing: 0 }
              }
            >
              {subtitle}
            </Text>
          )}
        </View>
      )}
    </SlideFrame>
  );
}

/** « Linky en chiffres » : les quatre chiffres du client, deux par rangée. */
function StatsSlide({ figures }: { figures: { value: number; label: string }[] }) {
  const { colors, theme } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${t('home.statsTitle')} : ${figures.map((f) => `${f.value} ${f.label}`).join(', ')}`}
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: theme === 'dark' ? 1 : 0,
        borderColor: colors.border,
      }}
    >
      <LinearGradient
        colors={[colors.primary, '#0B4A38']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={{ position: 'absolute', top: PAD, left: PAD, right: PAD, maxHeight: CONTENT_H, overflow: 'hidden' }}>
        {/* Or pâle (#FCF1DC) : 5,5:1 sur ce vert, contre 2,9:1 pour l'or plein. */}
        <Eyebrow color="#FCF1DC">{t('home.statsTitle')}</Eyebrow>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, marginTop: 10 }}>
          {figures.map((f) => (
            <View key={f.label} style={{ width: '50%', paddingRight: 8 }}>
              <Text
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{ fontSize: 24, lineHeight: 27, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 }}
              >
                {groupDigits(f.value)}
              </Text>
              <Text
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ fontSize: 11, lineHeight: 14, color: 'rgba(255,255,255,0.82)', letterSpacing: 0 }}
              >
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
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Toujours muette. Sans boucle dès qu'il y a une autre diapositive : sa fin
 *  fait passer à la suivante (onEnd). */
function HeroVideo({ uri, loop, onEnd }: { uri: string; loop: boolean; onEnd: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = loop;
  });
  useEffect(() => {
    player.loop = loop;
  }, [player, loop]);
  // ⚠ AUCUN pause() au démontage. useVideoPlayer LIBÈRE le lecteur dans son
  // propre nettoyage, qui passe AVANT celui-ci (React les exécute dans l'ordre
  // de déclaration) ; un appel sur un lecteur libéré lève « Cannot use shared
  // object that was already released ». Dans un nettoyage, l'erreur remonte au
  // plus proche ErrorBoundary — et sans lui, jusqu'à la racine : c'est la cause
  // la plus probable de l'ÉCRAN GRIS du 2026-10-26 (la vidéo de la première
  // diapositive démarrait, le carrousel passait à la suivante, son lecteur
  // était démonté). Reproduit et contrôlé le 2026-10-28 (relecture adverse).
  // La libération arrête la lecture ; Découvrir, la fiche et le splash font
  // pareil.
  useEffect(() => {
    player.play();
  }, [player]);
  useEffect(() => {
    // remove() sur un lecteur déjà libéré ne fait rien (vérifié) : sans risque.
    const sub = player.addListener('playToEnd', onEnd);
    return () => sub.remove();
  }, [player, onEnd]);
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
