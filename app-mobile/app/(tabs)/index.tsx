import { useMemo, useState } from 'react';
import { Dimensions, ScrollView, View, Pressable } from 'react-native';

// Popular-products swipe row: two cards fully visible inside the 20px page
// padding, with a sliver of the third peeking as the swipe affordance.
const POPULAR_CARD_WIDTH = Math.round((Dimensions.get('window').width - 2 * 20 - 12) / 2.12);
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { NoiseOverlay } from '../../src/components/visuals/NoiseOverlay';
import { WALLET_TOPUP_ENABLED } from '../../src/lib/flags';
import {
  Bell,
  ShoppingBag,
  Plus,
  ArrowDownToLine,
  QrCode,
  Store,
  Wallet,
  ChevronRight,
  Shirt,
  Smartphone,
  Sofa,
  Car,
  Sparkles as SparklesIcon,
  Building2,
  Home as HomeIcon,
  TreePine,
} from 'lucide-react-native';
import {
  EstateDashboard,
  IdentityPill,
  ModeTab,
  ShopDashboard,
  type ProMode,
} from '../../src/components/dashboards/ProDashboard';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Avatar } from '../../src/components/primitives/Avatar';
import { SectionHeader } from '../../src/components/lists/SectionHeader';
import { ShopMiniCard } from '../../src/components/lists/ShopCard';
import { ProductCard } from '../../src/components/lists/ProductCard';
import { PropertyCard } from '../../src/components/lists/PropertyCard';
import { ProductCardSkeleton } from '../../src/components/primitives/Skeleton';
import { formatGNF, formatEUR } from '../../src/lib/format';
import { gnfToEur } from '../../src/lib/currency';
import { haptic } from '../../src/lib/haptics';
import { photos } from '../../src/data/photos';
import { useAuth } from '../../src/stores/auth';
import { useCart } from '../../src/stores/cart';
import { useCreateListing } from '../../src/stores/createListing';
import { useFilters } from '../../src/stores/filters';
import {
  useShops,
  usePopularProducts,
  useNearbyProperties,
  useWallet,
  useMyShops,
  useMyProperties,
  useUnreadNotificationsCount,
} from '../../src/data/queries';

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
  const { colors } = useTheme();
  const hasBoth = isSeller && isAgent;
  const [mode, setMode] = useState<ProMode>(isSeller ? 'shop' : 'estate');
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();
  const resetDraft = useCreateListing((s) => s.reset);
  const setKind = useCreateListing((s) => s.setKind);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
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
            accessibilityLabel="Notifications"
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
            accessibilityLabel={mode === 'shop' ? 'Nouvelle annonce' : 'Nouveau bien'}
          >
            <Plus size={20} color={colors.bg} strokeWidth={2.25} />
          </Pressable>
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
                label="Boutique"
                active={mode === 'shop'}
                onPress={() => setMode('shop')}
              />
              <ModeTab
                Icon={Building2}
                label="Immobilier"
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
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const cartCount = useCart((s) => s.lines.length);
  const roles = useAuth((s) => s.roles);
  const hasPro = roles.includes('seller') || roles.includes('agent');
  const { data: shops, isLoading: shopsLoading } = useShops(3);
  const { data: products, isLoading: prodLoading } = usePopularProducts(4);
  const { data: properties, isLoading: propLoading } = useNearbyProperties(3);
  const walletQuery = useWallet();
  const wallet = walletQuery.data;
  const walletReady = !walletQuery.isLoading && !walletQuery.isError && !!wallet;
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();

  const firstName = (user?.display_name ?? t('home.fallbackName')).split(' ')[0];
  const CATEGORIES = useMemo(
    () => CATEGORY_DEFS.map((c) => ({ ...c, label: t(c.labelKey) })),
    [t],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
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
            <Text
              style={{
                fontSize: 18,
                fontWeight: '700',
                color: colors.text,
                marginTop: 1,
              }}
              numberOfLines={1}
            >
              {firstName} 👋
            </Text>
          </View>
          <CircleAction
            onPress={() => router.push('/notifications')}
            accessibilityLabel={t('home.notifications')}
            badge={unreadCount > 0 ? 'dot' : undefined}
          >
            <Bell size={18} color={colors.text} strokeWidth={1.75} />
          </CircleAction>
          {/* Phase X.10 (revised) — Messagerie is back as a dedicated tab and
              Boutique was fused into the Profil hero card. The X.10-first
              Messages icon + Home Boutique shortcut were both removed so the
              header carries only universal commerce actions. */}
          <CircleAction
            onPress={() => router.push('/cart')}
            accessibilityLabel={t('home.cart', { count: cartCount })}
            badge={cartCount > 0 ? String(cartCount) : undefined}
          >
            <ShoppingBag size={18} color={colors.text} strokeWidth={1.75} />
          </CircleAction>
        </View>

        {/* Pro summary — only when user has buyer + a pro role */}
        {hasPro && (
          <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
            <ProSummaryCard
              isSeller={roles.includes('seller')}
              isAgent={roles.includes('agent')}
            />
          </View>
        )}

        {/* Wallet hero */}
        <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
          {/* Phase U.0 should-fix — pre-U0 a cold 3G start showed a
              confident "0 GNF / ≈ 0 €" for seconds. Pass ready state so
              the hero shows "—" until the wallet query resolves. */}
          <HomeWalletCard
            balanceGnf={wallet?.balanceGnf ?? 0}
            ready={walletReady}
            onRecharger={WALLET_TOPUP_ENABLED ? () => router.push('/wallet/recharger') : undefined}
            onRetirer={() => router.push('/wallet/retirer')}
            onTap={() => router.push('/wallet')}
          />
        </View>

        {/* Quick actions */}
        <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <QuickAction
              Icon={QrCode}
              label={t('home.qaScan')}
              onPress={() => router.push('/scan')}
            />
            <QuickAction
              Icon={ArrowDownToLine}
              label={t('home.qaWithdraw')}
              onPress={() => router.push('/wallet/retirer')}
            />
            <QuickAction
              Icon={Store}
              label={t('home.qaSell')}
              onPress={() => {
                // Phase T.2 — pure buyer used to dead-end into the create
                // modal's "Va dans Profil → Rôles" copy (a screen that
                // didn't exist). Route the upgrade pitch instead ; sellers
                // and agents continue straight into the wizard.
                if (roles.includes('seller') || roles.includes('agent')) {
                  router.push('/create');
                } else {
                  router.push('/profil/devenir?role=seller' as never);
                }
              }}
            />
            {/* Top-up removed (wallet restructure) — surface the wallet itself
                instead so the row keeps 4 actions. */}
            <QuickAction
              Icon={Wallet}
              label={t('home.qaWallet')}
              onPress={() => router.push('/wallet')}
            />
          </View>
        </View>

        {/* Categories — 4 col x 2 row grid */}
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
              {t('home.categoriesSection')}
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/marche')}>
              <Text
                style={{ fontSize: 13, fontWeight: '600', color: colors.primary, letterSpacing: 0 }}
              >
                {t('home.seeAll')}
              </Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {CATEGORIES.map((c) => (
              <CategoryGridTile
                key={c.code}
                Icon={c.Icon}
                label={c.label}
                tint={c.tint}
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
          </View>
        </View>

        {/* Featured shops — same swipe row as popular products : two cards
            visible, a peek of the third, snap per card. */}
        <View style={{ marginTop: 28 }}>
          <SectionHeader title={t('home.shopsSection')} action={t('home.seeAll')} onAction={() => router.push('/(tabs)/marche')} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={POPULAR_CARD_WIDTH + 12}
            decelerationRate="fast"
            contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
          >
            {shopsLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <View key={i} style={{ width: POPULAR_CARD_WIDTH, height: 110, borderRadius: 16, backgroundColor: colors.bgSunken }} />
                ))
              : shops?.map((s) => <ShopMiniCard key={s.id} shop={s} width={POPULAR_CARD_WIDTH} />) ?? null}
          </ScrollView>
        </View>

        {/* Popular products — one horizontal swipe row : two cards visible,
            a peek of the third invites the swipe (was a vertical 2-col grid). */}
        <View style={{ marginTop: 28 }}>
          <View style={{ paddingHorizontal: 20 }}>
            <SectionHeader
              title={t('home.popularSection')}
              action={t('home.seeAll')}
              onAction={() => router.push('/(tabs)/marche')}
            />
          </View>
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

        {/* Découvrir teaser */}
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <Pressable
            onPress={() => router.push('/(tabs)/decouvrir')}
            style={{
              backgroundColor: '#0E1311',
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
              <Text style={{ fontSize: 20, color: '#FFFFFF', fontWeight: '700', lineHeight: 24 }}>
                {t('home.decouvrirTitle')}
              </Text>
              <Text
                style={{
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.62)',
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
              {products?.[0]?.photos?.[0] && (
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
              {properties?.[0]?.photos?.[0] && (
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
                    borderColor: '#0E1311',
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
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronRight size={16} color="#0E1311" strokeWidth={2} />
            </View>
          </Pressable>
        </View>

        {/* Real estate near */}
        <View style={{ marginTop: 28 }}>
          <SectionHeader
            title={t('home.nearbyPropertiesSection')}
            action={t('home.seeAll')}
            onAction={() => router.push('/(tabs)/marche')}
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
                    <PropertyCard property={p} />
                  </View>
                )) ?? null}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------- Subcomponents ----------

function CircleAction({
  onPress,
  children,
  badge,
  accessibilityLabel,
}: {
  onPress: () => void;
  children: React.ReactNode;
  badge?: 'dot' | string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      accessibilityLabel={accessibilityLabel}
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
    >
      {children}
      {badge === 'dot' ? (
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
      ) : typeof badge === 'string' ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 5,
            borderRadius: 999,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: '700',
              lineHeight: 12,
              includeFontPadding: false,
            }}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function HomeWalletCard({
  balanceGnf,
  ready,
  onRecharger,
  onRetirer,
  onTap,
}: {
  balanceGnf: number;
  ready: boolean;
  onRecharger?: () => void;
  onRetirer: () => void;
  onTap: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onTap}>
      <View
        style={{
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: '#0A5240',
        }}
      >
        {/* Base emerald gradient */}
        <LinearGradient
          colors={['#118866', '#0A5240', '#063929']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* Soft saffron blob bleed (top-right) for mesh feel */}
        <LinearGradient
          colors={['rgba(232,165,61,0.35)', 'rgba(232,165,61,0)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.3, y: 0.6 }}
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 200,
            height: 200,
            borderRadius: 999,
          }}
        />
        {/* Cool mint blob (bottom-left) */}
        <LinearGradient
          colors={['rgba(120,220,180,0.18)', 'rgba(120,220,180,0)']}
          start={{ x: 0, y: 1 }}
          end={{ x: 0.6, y: 0.4 }}
          style={{
            position: 'absolute',
            bottom: -50,
            left: -30,
            width: 220,
            height: 220,
            borderRadius: 999,
          }}
        />
        {/* Grain overlay */}
        <NoiseOverlay />

        {/* Content */}
        <View style={{ padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: 'rgba(255,255,255,0.65)',
                letterSpacing: 0.6,
              }}
            >
              {t('home.walletBalance')}
            </Text>
            <Image
              source={require('../../assets/images/adaptive-icon-dark.png')}
              style={{ width: 64, height: 64 }}
              contentFit="contain"
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
            <Text
              style={{
                fontSize: 32,
                fontWeight: '700',
                color: '#FFFFFF',
                lineHeight: 38,
                includeFontPadding: false,
              }}
            >
              {ready ? formatGNF(balanceGnf).replace(' GNF', '') : '—'}
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: 'rgba(255,255,255,0.72)',
                fontWeight: '600',
              }}
            >
              GNF
            </Text>
          </View>
          {/* Phase T.4 — formatEUR already prefixes "≈" ; pre-fix this rendered
              "≈ ≈" doubled. U.0 — and "—" while loading/error so we don't
              confidently show ≈ 0 € on a cold 3G start. */}
          <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
            {ready ? formatEUR(gnfToEur(balanceGnf)) : '—'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            {/* Top-up removed (wallet restructure) — pill renders only when the
                parent passes onRecharger (gated by WALLET_TOPUP_ENABLED). */}
            {onRecharger && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  haptic.light();
                  onRecharger();
                }}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 999,
                  backgroundColor: '#FFFFFF',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Plus size={14} color="#0A5240" strokeWidth={2.5} />
                <Text style={{ color: '#0A5240', fontWeight: '700', fontSize: 13.5 }}>
                  {t('home.walletRecharge')}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                haptic.light();
                onRetirer();
              }}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.16)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.22)',
              }}
            >
              <ArrowDownToLine size={14} color="#FFFFFF" strokeWidth={2.25} />
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13.5 }}>
                {t('home.walletWithdraw')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function QuickAction({
  Icon,
  label,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={22} color={colors.text} strokeWidth={1.75} />
      </View>
      <Text
        style={{
          fontSize: 11.5,
          fontWeight: '600',
          color: colors.text,
          letterSpacing: 0,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Phase I.9 — categories carry a stable filter CODE (matches the legacy
// hardcoded string used by useFilters + marche's PRODUCT_CATEGORY_DEFS for
// backward compat) plus a labelKey resolved at render so labels flip live.
const CATEGORY_DEFS: Array<{
  Icon: LucideIcon;
  code: string;
  labelKey: string;
  tint: 'primary' | 'accent' | 'cream' | 'info' | 'mint' | 'rose' | 'lilac' | 'sand';
}> = [
  // `code` MUST equal the value the create wizard stores on the product
  // (create/product/category.tsx) — else the tile filters to an empty Marché.
  { Icon: Smartphone,    code: 'Électronique',      labelKey: 'create.catElectronique',   tint: 'accent' },
  { Icon: Shirt,         code: 'Vêtements & Mode',  labelKey: 'create.catVetementsMode',  tint: 'primary' },
  { Icon: Sofa,          code: 'Maison & Déco',     labelKey: 'create.catMaisonDeco',     tint: 'cream' },
  { Icon: Car,           code: 'Auto & Moto',       labelKey: 'create.catAutoMoto',       tint: 'info' },
  { Icon: SparklesIcon,  code: 'Beauté & Santé',    labelKey: 'create.catBeauteSante',    tint: 'rose' },
  { Icon: Building2,     code: 'Location',    labelKey: 'home.catLocation',    tint: 'mint' },
  { Icon: HomeIcon,      code: 'Vente',       labelKey: 'home.catVente',       tint: 'lilac' },
  { Icon: TreePine,      code: 'Terrains',    labelKey: 'home.catTerrains',    tint: 'sand' },
];

const TINTS: Record<string, { bg: string; fg: string }> = {
  primary: { bg: '#E8F2EE', fg: '#0F7256' },
  accent: { bg: '#FCF1DC', fg: '#B5821C' },
  cream: { bg: '#F1EAD9', fg: '#7A6238' },
  info: { bg: '#E4ECF6', fg: '#2F5BBE' },
  mint: { bg: '#E2F2EA', fg: '#198754' },
  rose: { bg: '#FBE7E5', fg: '#B53D2F' },
  lilac: { bg: '#ECE5F4', fg: '#634CA0' },
  sand: { bg: '#F2EBDD', fg: '#8C6E3A' },
};

function CategoryGridTile({
  Icon,
  label,
  tint,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  tint: keyof typeof TINTS;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const t = TINTS[tint] ?? TINTS.primary;
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={{
        flexBasis: '22%',
        flexGrow: 1,
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          maxWidth: 78,
          borderRadius: 18,
          backgroundColor: t.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={24} color={t.fg} strokeWidth={1.75} />
      </View>
      <Text
        style={{
          fontSize: 11.5,
          fontWeight: '600',
          color: colors.text,
          letterSpacing: 0,
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ====================================================================
// ProSummaryCard — shown on BuyerHome when user has pro role(s).
// Quick link into the Boutique tab dashboard.
// ====================================================================

function ProSummaryCard({ isSeller, isAgent }: { isSeller: boolean; isAgent: boolean }) {
  const { colors } = useTheme();
  const { data: shops } = useMyShops();
  const { data: properties } = useMyProperties();

  const shopCount = shops?.length ?? 0;
  const propertyCount = properties?.length ?? 0;
  const productAndPropertyCount = propertyCount; // products counted via shop scope on the Pro tab

  // No shop AND no properties → hide the whole CTA. Showing "0 GNF" or
  // "0 commandes" would burn the first impression for a fresh multi-role user.
  // We wait until the user has at least one listing before promoting the Pro tab.
  if (shopCount === 0 && propertyCount === 0) return null;

  const badgeLabel = isSeller && isAgent ? 'MODE PRO' : isSeller ? 'BOUTIQUE' : 'AGENCE IMMO';
  const sublabel = shopCount > 0 && propertyCount > 0
    ? `${shopCount} boutique${shopCount > 1 ? 's' : ''} · ${propertyCount} bien${propertyCount > 1 ? 's' : ''}`
    : shopCount > 0
      ? `${shopCount} boutique${shopCount > 1 ? 's' : ''}`
      : `${productAndPropertyCount} bien${productAndPropertyCount > 1 ? 's' : ''}`;

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/boutique')}
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: colors.text,
      }}
    >
      <View style={{ padding: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}
          >
            {isSeller ? (
              <Store size={11} color="#FFFFFF" strokeWidth={2} />
            ) : (
              <Building2 size={11} color="#FFFFFF" strokeWidth={2} />
            )}
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: '700',
                color: '#FFFFFF',
                letterSpacing: 0.5,
              }}
            >
              {badgeLabel}
            </Text>
          </View>
          <ChevronRight size={16} color="rgba(255,255,255,0.6)" strokeWidth={2} />
        </View>

        <Text
          style={{
            fontSize: 18,
            fontWeight: '700',
            color: '#FFFFFF',
            letterSpacing: -0.2,
            marginTop: 14,
          }}
        >
          Tableau de bord
        </Text>
        <Text
          style={{
            fontSize: 12.5,
            fontWeight: '500',
            color: 'rgba(255,255,255,0.65)',
            letterSpacing: 0,
            marginTop: 4,
          }}
        >
          {sublabel}
        </Text>
      </View>
    </Pressable>
  );
}
