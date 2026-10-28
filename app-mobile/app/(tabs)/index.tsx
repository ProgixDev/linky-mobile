import { useCallback, useMemo, useState } from 'react';
import { Dimensions, RefreshControl, ScrollView, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Plus,
  ChevronRight,
  Sparkles as SparklesIcon,
  Building2,
  Home as HomeIcon,
  Hand,
} from 'lucide-react-native';
import {
  EstateDashboard,
  IdentityPill,
  ModeTab,
  ShopDashboard,
  type ProMode,
} from '../../src/components/dashboards/ProDashboard';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Avatar } from '../../src/components/primitives/Avatar';
import { SectionHeader } from '../../src/components/lists/SectionHeader';
import { ProductCard } from '../../src/components/lists/ProductCard';
import { PropertyCard } from '../../src/components/lists/PropertyCard';
import { ProductCardSkeleton } from '../../src/components/primitives/Skeleton';
import { haptic } from '../../src/lib/haptics';
import { listingScope } from '../../src/lib/persona';
import { useAuth } from '../../src/stores/auth';
import { HeaderActions } from '../../src/components/nav/HeaderActions';
import { HomeHero } from '../../src/components/home/HomeHero';
import { HomeSectionBoundary } from '../../src/components/home/HomeSectionBoundary';
import { CategoryGlyph, type CategoryGlyphName } from '../../src/icons/CategoryGlyph';
import { useCreateListing } from '../../src/stores/createListing';
import { useFilters } from '../../src/stores/filters';
import {
  usePopularProducts,
  useNearbyProperties,
  useUnreadNotificationsCount,
} from '../../src/data/queries';

// Popular-products / featured-shops swipe rows: two cards fully visible inside
// the 20px page padding, with a sliver of the third peeking as the swipe
// affordance.
const POPULAR_CARD_WIDTH = Math.round((Math.min(Dimensions.get('window').width, 500) - 2 * 20 - 12) / 2.12);

export default function HomeRoute() {
  const roles = useAuth((s) => s.roles);
  const isBuyer = roles.includes('buyer');
  const isSeller = roles.includes('seller');
  const isAgent = roles.includes('agent');
  const isPurePro = (isSeller || isAgent) && !isBuyer;

  if (isPurePro) return <ProHome isSeller={isSeller} isAgent={isAgent} />;
  return <BuyerHome />;
}

// ====================================================================
// ProHome — for users who are seller/agent without buyer role.
// Their home IS the dashboard.
// ====================================================================

function ProHome({ isSeller, isAgent }: { isSeller: boolean; isAgent: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const hasBoth = isSeller && isAgent;
  const [mode, setMode] = useState<ProMode>(isSeller ? 'shop' : 'estate');
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();
  const resetDraft = useCreateListing((s) => s.reset);
  const setKind = useCreateListing((s) => s.setKind);

  // TIRER POUR METTRE A JOUR, ici aussi.
  //
  // Contrairement a l'accueil acheteur, on invalide TOUT : le contenu de cet
  // ecran EST le tableau de bord (ventes, commandes, biens), et ne rafraichir
  // que le portefeuille laisserait les chiffres qui comptent a leur valeur du
  // dernier montage. React Query ne refetche que les requetes ACTIVES, donc ce
  // geste ne recharge que ce qui est reellement a l'ecran.
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: hasBoth ? 14 : 22,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <IdentityPill mode={mode} />
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => {
              haptic.light();
              router.push('/notifications');
            }}
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel={t('a11y.notifications')}
          >
            <Bell size={18} color={colors.text} strokeWidth={1.75} />
            {unreadCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 9,
                  height: 9,
                  borderRadius: 999,
                  backgroundColor: colors.danger,
                  borderWidth: 2,
                  borderColor: colors.card,
                }}
              />
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              haptic.light();
              // Phase U.0 nit — mirror the chooser's reset+setKind so the
              // ProHome FAB doesn't resume a stale abandoned draft.
              resetDraft();
              setKind(mode === 'shop' ? 'product' : 'property');
              router.push(mode === 'shop' ? '/create/product/seller' : '/create/property/details');
            }}
            style={{
              width: 48,
              height: 48,
              borderRadius: 999,
              backgroundColor: colors.text,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel={mode === 'shop' ? t('home.newListing') : t('home.newProperty')}
          >
            <Plus size={20} color={colors.bg} strokeWidth={2.25} />
          </Pressable>
        </View>

        {/* Carrousel + chiffres en tête (client 2026-10-25), AVANT les onglets
            Boutique / Immobilier : ces onglets pilotent le tableau de bord juste
            en dessous, ils doivent rester collés à lui. */}
        <View style={{ paddingBottom: 22 }}>
          <HomeSectionBoundary name="carrousel"><HomeHero /></HomeSectionBoundary>
        </View>

        {hasBoth && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <View
              style={{
                flexDirection: 'row',
                gap: 6,
                padding: 4,
                borderRadius: 999,
                backgroundColor: colors.bgSunken,
              }}
            >
              <ModeTab
                Icon={HomeIcon}
                label={t('a11y.shop')}
                active={mode === 'shop'}
                onPress={() => setMode('shop')}
              />
              <ModeTab
                Icon={Building2}
                label={t('pro.tabEstate')}
                active={mode === 'estate'}
                onPress={() => setMode('estate')}
              />
            </View>
          </View>
        )}

        {mode === 'shop' ? <ShopDashboard /> : <EstateDashboard />}

      </ScrollView>
    </SafeAreaView>
  );
}

// ====================================================================
// BuyerHome — original home for buyers and mixed users.
// ====================================================================

function BuyerHome() {
  const { colors, theme } = useTheme();
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const roles = useAuth((s) => s.roles);
  // SEPARATION DES MODES sur l'ACCUEIL (client 2026-09-08 22:50). L'accueil
  // affiche des annonces des DEUX categories — boutiques, produits populaires,
  // logements a proximite, jusqu'aux pastilles Location / Vente / Terrains.
  // Corriger le Marche et Decouvrir sans corriger l'accueil aurait laisse la
  // premiere page de l'application contredire la regle.
  const scope = listingScope(roles);
  const onlyProducts = scope === 'products';
  const onlyProperties = scope === 'properties';
  const { data: products, isLoading: prodLoading } = usePopularProducts(4, !onlyProperties);
  const { data: properties, isLoading: propLoading } = useNearbyProperties(3, !onlyProducts);

  // TIRER POUR METTRE A JOUR. Ce qui bouge sur cet ecran : les chiffres, les
  // pubs et les videos d'annonces du carrousel (fil Decouvrir), les rangees
  // d'annonces (dont les pubs integrees tirent aussi leurs photos) et la
  // pastille de la cloche. C'est
  // aussi LE geste pour voir une pub que le client vient d'ajouter sans
  // relancer l'app : rien d'autre ne redemande home-promos (pas de rechargement
  // au retour sur l'app, et l'onglet ne se remonte jamais).
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['home-promos'] }),
        qc.invalidateQueries({ queryKey: ['discover-feed'] }),
        qc.invalidateQueries({ queryKey: ['app-stats'] }),
        qc.invalidateQueries({ queryKey: ['products-popular'] }),
        qc.invalidateQueries({ queryKey: ['properties-nearby'] }),
        qc.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  const firstName = (user?.display_name ?? t('home.fallbackName')).split(' ')[0];
  // Les trois dernieres pastilles (Location / Vente / Terrains) menent a
  // l'onglet Immobilier et les cinq premieres aux articles : une grille non
  // filtree offrirait une porte d'entree vers ce qu'on vient de masquer
  // ailleurs.
  const CATEGORIES = useMemo(
    () =>
      CATEGORY_DEFS.filter((c) => {
        const isImmo = c.code === 'Location' || c.code === 'Vente' || c.code === 'Terrains';
        return isImmo ? !onlyProducts : !onlyProperties;
      }).map((c) => ({ ...c, label: t(c.labelKey) })),
    [t, onlyProducts, onlyProperties],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Avatar source={user?.avatar_url ?? undefined} size="md" />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                color: colors.textMuted,
                letterSpacing: 0,
                fontWeight: '500',
              }}
            >
              {t('home.greeting')}
            </Text>
            {/* Icone de marque plutot qu'un emoji 👋 : l'emoji est rendu par la
                police systeme, donc son style change d'un telephone a l'autre et
                echappe a l'identite visuelle (client 2026-08-11). Ici, l'or de
                la marque et le meme trait que toutes les autres icones.
                flexShrink sur le prenom pour que la main reste visible meme avec
                un prenom long. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: colors.text,
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {firstName}
              </Text>
              {/* Inclinee comme l'emoji d'origine : une main droite verticale
                  se lit comme un « stop », inclinee elle se lit comme un salut.
                  La rotation est portee par un View — les icones ne prennent pas
                  de transform directement. */}
              <View style={{ transform: [{ rotate: '20deg' }] }}>
                <Hand size={17} color={colors.accent} strokeWidth={2.25} />
              </View>
            </View>
          </View>
          {/* Favoris / notifications / panier — LE COMPOSANT PARTAGE, plus une
              copie locale. Le commentaire d'origine disait deja que le trio
              devait rester « consistent with the Marché header » (client
              2026-07-26) ; il l'etait par recopie, et une recopie finit
              toujours par diverger. Elle avait deja commence : quand le client
              a demande de ne laisser que la cloche sans le role acheteur
              (2026-09-08 23:00), seul l'exemplaire de Marche l'a appris.
              L'accueil aurait garde panier et favoris pour un compte livreur —
              qui n'est pas « pro pur » au sens de isPurePro, donc atterrit ici.
              Un seul exemplaire : la regle s'applique aux deux ecrans. */}
          <HeaderActions />
        </View>

        {/* Barre de recherche + bouton Filtres RETIRÉS de l'accueil (client
            2026-10-28 : « on peut retirer ça, il renvoie sur la page annonces,
            il y a déjà une barre de recherche là-bas »). Ils ne faisaient
            qu'ouvrir ceux du Marché, qui restent la seule recherche de l'app. */}

        {/* Pro summary card removed from the Home (client 2026-07-30): it
            duplicated the pro workspace, which is already reachable from the
            Profil tab (combined "Espace pro" card). Frees space above the
            wallet. */}

        {/* « Ce type de tableau de bord pour la page d'accueil » (client
            2026-10-25, maquette TechHub) : UN seul écran qui fait défiler les
            chiffres de l'application et les pubs, avec « Publier maintenant ».
            En TÊTE : c'est la première chose que le client veut voir. */}
        <HomeSectionBoundary name="carrousel"><HomeHero /></HomeSectionBoundary>
        {/* LES CATEGORIES, JUSTE SOUS LE CARROUSEL (client 2026-10-26, maquette
            a l'appui) : une rangee de pastilles rondes, icone noire sur fond
            blanc, SANS titre au-dessus — la rangee se lit d'elle-meme. Elle
            defile : huit categories ne tiennent pas sur un ecran. Pour un
            vendeur (5) ou une agence (3), elles tiennent, et se repartissent
            sur toute la largeur. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 16 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            // De l'air au-dessus et en dessous : sans lui, Android coupe net
            // l'ombre des pastilles au bord de la rangee.
            paddingVertical: 6,
            gap: 10,
            flexGrow: 1,
            justifyContent: CATEGORIES.length <= 5 ? 'space-between' : 'flex-start',
          }}
        >
          {CATEGORIES.map((c) => (
            <CategoryCircle
              key={c.code}
              glyph={c.glyph}
              label={c.label}
              onPress={() => {
                // Seed the marketplace filter so the tile lands on its
                // actual category, not an unfiltered marché. Match by the
                // stable filter CODE (legacy FR string the store stores),
                // never by translated label.
                const f = useFilters.getState();
                if (c.code === 'Location' || c.code === 'Vente' || c.code === 'Terrains') {
                  f.setMarcheTab('immobilier');
                  f.setPropertyType(c.code === 'Location' ? 'location' : c.code === 'Vente' ? 'vente' : 'terrain');
                } else {
                  f.setMarcheTab('articles');
                  f.setProductCategory(c.code);
                }
                router.push('/(tabs)/marche');
              }}
            />
          ))}
        </ScrollView>


        {/* Portefeuille et Activite RETIRES de l'accueil (client 2026-10-27 :
            « On peut retirer le wallet et les activites »). Rien ne devient
            introuvable : le portefeuille reste dans l'onglet Profil, l'activite
            derriere la cloche des notifications, en haut de cet ecran. */}

        {/* « Boutiques mises en avant » RETIRÉE (client 2026-10-27). Elle ne
            montrait que les boutiques VÉRIFIÉES, et il n'y en avait aucune : un
            titre au-dessus d'une rangée vide. */}

        {/* Popular products — one horizontal swipe row : two cards visible,
            a peek of the third invites the swipe (was a vertical 2-col grid). */}
        {!onlyProperties && (
          <View style={{ marginTop: 28 }}>
            {/* SectionHeader porte deja sa marge : l'envelopper d'une marge de
                plus decalait ce titre vers la droite (capture du 2026-10-27). */}
            <SectionHeader
              title={t('home.popularSection')}
              action={t('home.seeAll')}
              onAction={() => {
                useFilters.getState().setMarcheTab('articles');
                router.push('/(tabs)/marche');
              }}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={POPULAR_CARD_WIDTH + 12}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            >
              {prodLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <View key={i} style={{ width: POPULAR_CARD_WIDTH }}>
                      <ProductCardSkeleton />
                    </View>
                  ))
                : products?.map((p) => (
                    <View key={p.id} style={{ width: POPULAR_CARD_WIDTH }}>
                      <ProductCard product={p} />
                    </View>
                  ))}
            </ScrollView>
          </View>
        )}

        {/* Découvrir teaser */}
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <Pressable
            onPress={() => router.push('/(tabs)/decouvrir')}
            style={{
              // Theme-aware teaser (client 2026-07-27): dark feature card in
              // dark mode, light card in light mode (was hard-locked dark).
              backgroundColor: theme === 'dark' ? '#0E1311' : colors.card,
              borderWidth: 1,
              borderColor: theme === 'dark' ? 'transparent' : colors.border,
              borderRadius: 22,
              padding: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
              overflow: 'hidden',
            }}
          >
            <View style={{ flex: 1 }}>
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: 'rgba(232,165,61,0.18)',
                  marginBottom: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <SparklesIcon size={10} color={colors.accent} strokeWidth={2.25} />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: colors.accent,
                    letterSpacing: 0.5,
                  }}
                >
                  {t('home.decouvrirBadge')}
                </Text>
              </View>
              <Text style={{ fontSize: 20, color: theme === 'dark' ? '#FFFFFF' : colors.text, fontWeight: '700', lineHeight: 24 }}>
                {t('home.decouvrirTitle')}
              </Text>
              <Text
                style={{
                  fontSize: 12.5,
                  color: theme === 'dark' ? 'rgba(255,255,255,0.62)' : colors.textMuted,
                  marginTop: 6,
                  letterSpacing: 0,
                }}
              >
                {t('home.decouvrirSub')}
              </Text>
            </View>
            <View
              style={{
                width: 88,
                height: 110,
                position: 'relative',
              }}
            >
              {!onlyProperties && products?.[0]?.photos?.[0] && (
                <Image
                  source={{ uri: products[0].photos[0] }}
                  style={{
                    position: 'absolute',
                    width: 64,
                    height: 88,
                    borderRadius: 14,
                    left: 0,
                    top: 8,
                    transform: [{ rotate: '-8deg' }],
                  }}
                  contentFit="cover"
                />
              )}
              {!onlyProducts && properties?.[0]?.photos?.[0] && (
                <Image
                  source={{ uri: properties[0].photos[0] }}
                  style={{
                    position: 'absolute',
                    width: 64,
                    height: 88,
                    borderRadius: 14,
                    right: 0,
                    top: 0,
                    transform: [{ rotate: '6deg' }],
                    borderWidth: 2,
                    borderColor: theme === 'dark' ? '#0E1311' : colors.card,
                  }}
                  contentFit="cover"
                />
              )}
            </View>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                backgroundColor: theme === 'dark' ? '#FFFFFF' : colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronRight size={16} color={theme === 'dark' ? '#0E1311' : '#FFFFFF'} strokeWidth={2} />
            </View>
          </Pressable>
        </View>

        {/* Real estate near — masque pour un vendeur d'articles :
            separation des modes. */}
        {!onlyProducts && (
          <View style={{ marginTop: 28 }}>
            <SectionHeader
              title={t('home.nearbyPropertiesSection')}
              action={t('home.seeAll')}
              onAction={() => {
                // Marché reads its tab from the filters store and remembers the
                // last one used, so a « voir tout » that doesn't set it lands on
                // whatever the user browsed before (client 2026-08-05).
                useFilters.getState().setMarcheTab('immobilier');
                router.push('/(tabs)/marche');
              }}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
            >
              {propLoading
                ? Array.from({ length: 2 }).map((_, i) => (
                    <View key={i} style={{ width: 260, height: 200, borderRadius: 16, backgroundColor: colors.bgSunken }} />
                  ))
                : properties?.map((p) => (
                    <View key={p.id} style={{ width: 260 }}>
                      <PropertyCard property={p} compact />
                    </View>
                  )) ?? null}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------- Subcomponents ----------


// QuickAction tile row removed 2026-07-06 — Scanner/Retirer live in the
// Profil shortcuts, Wallet is the green card, Vendre is a full-width CTA.

// Phase I.9 — categories carry a stable filter CODE (matches the legacy
// hardcoded string used by useFilters + marche's PRODUCT_CATEGORY_DEFS for
// backward compat) plus a labelKey resolved at render so labels flip live.
const CATEGORY_DEFS: Array<{
  glyph: CategoryGlyphName;
  code: string;
  labelKey: string;
}> = [
  // `code` MUST equal the value the create wizard stores on the product
  // (create/product/category.tsx) — else the tile filters to an empty Marché.
  { glyph: 'phone',     code: 'Électronique',      labelKey: 'create.catElectronique' },
  { glyph: 'apparel',   code: 'Vêtements & Mode',  labelKey: 'create.catVetementsMode' },
  { glyph: 'sofa',      code: 'Maison & Déco',     labelKey: 'create.catMaisonDeco' },
  { glyph: 'car',       code: 'Auto & Moto',       labelKey: 'create.catAutoMoto' },
  { glyph: 'spa',       code: 'Beauté & Santé',    labelKey: 'create.catBeauteSante' },
  { glyph: 'key',       code: 'Location',          labelKey: 'home.catLocation' },
  { glyph: 'house',     code: 'Vente',             labelKey: 'home.catVente' },
  { glyph: 'landscape', code: 'Terrains',          labelKey: 'home.catTerrains' },
];

function CategoryCircle({
  glyph,
  label,
  onPress,
}: {
  glyph: CategoryGlyphName;
  label: string;
  onPress: () => void;
}) {
  const { colors, theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Largeur FIXE : les libelles longs (« Vetements & Mode ») passent sur
      // deux lignes au lieu d'elargir la pastille. 78 et pas moins : a 64,
      // « Electronique » etait coupe au milieu du mot (capture du 2026-10-26).
      style={{ width: 78, alignItems: 'center', gap: 7 }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 999,
          // Noir sur blanc en mode clair. En mode sombre, l'inverse : un disque
          // blanc sur fond noir eblouirait. colors.card / colors.text suivent
          // le theme d'eux-memes.
          backgroundColor: colors.card,
          // Sans bordure en clair : c'est l'ombre qui detache la pastille, comme
          // sur la maquette. En sombre, pas d'ombre visible : la bordure la remplace.
          borderWidth: theme === 'dark' ? 1 : 0,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          ...(theme === 'dark'
            ? null
            : {
                shadowColor: '#000000',
                shadowOpacity: 0.08,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }),
        }}
      >
        <CategoryGlyph name={glyph} size={26} color={colors.text} />
      </View>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: colors.text,
          letterSpacing: 0,
          textAlign: 'center',
          lineHeight: 14,
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ProSummaryCard removed 2026-07-30 — the Home no longer shows a pro dashboard
// teaser (duplicated the Profil "Espace pro" card). Pure-pro users still land
// on their dashboard directly; buyers-with-a-pro-role reach it from Profil.
