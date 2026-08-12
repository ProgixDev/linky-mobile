// Buy a boost — pick one of your active listings (a product OR a property),
// pick a duration tier, pay from the wallet. Price is server-authoritative
// (create-boost re-derives it from days); this screen only sends
// { productId | propertyId, days }. Insufficient balance surfaces a message.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { TopBar } from '../../../src/components/nav/TopBar';
import { formatGNF } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';
import { useToast } from '../../../src/components/feedback/Toast';
import { ApiError, toToastMessage } from '../../../src/lib/api';
import {
  useBoosts,
  useCreateBoost,
  useMyShops,
  useMyProperties,
  useProducts,
  useWallet,
  type BoostPayMethod,
} from '../../../src/data/queries';

/** Les trois rails ouverts au boost (client 2026-08-12). Stripe n'y figure pas :
 *  le rail carte a ete abandonne en juillet 2026 (pas de compte live, cartes
 *  guineennes refusees) — l'argent passe par le portefeuille ou par le mobile
 *  money via Lengopay, exactement comme une commande. */
const PAY_METHODS: { id: BoostPayMethod; nameKey: string; badge: string; badgeColor: string; badgeFg?: string; logo?: number }[] = [
  { id: 'wallet', nameKey: 'pro.boostMethodWallet', badge: 'W', badgeColor: '#1F6F5C' },
  { id: 'orange-money', nameKey: 'pro.boostMethodOrange', badge: 'OM', badgeColor: '#FF7900', logo: require('../../../assets/images/pay-orange-money.png') },
  { id: 'mtn-money', nameKey: 'pro.boostMethodMtn', badge: 'MTN', badgeColor: '#FFCB05', badgeFg: '#000000', logo: require('../../../assets/images/pay-mtn-momo.png') },
];

type Selection = { kind: 'product' | 'property'; id: string };

export default function BoostNewRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();

  const { data: shops } = useMyShops();
  // Products hang off the BOUTIQUE. Since boutique and agence immo became
  // separate rows (2026-08-07), shops[0] could be the agency — which returned
  // zero products and made the boost picker look empty for sellers who also
  // list real estate.
  const myShop = shops?.find((s) => (s.kind ?? 'shop') === 'shop');
  const { data: products } = useProducts({ shopId: myShop?.id });
  const { data: properties } = useMyProperties();
  // Only the caller's OWN products are boostable. useProducts({ shopId }) returns
  // EVERY marketplace product (minus own) while myShop.id is still undefined —
  // surfacing other sellers' listings that then fail the RPC ownership check
  // (« Cette annonce ne t'appartient pas »). Filter to the caller's shop ids so
  // the picker can only ever show boostable listings (client 2026-07-31).
  const myShopIds = useMemo(() => new Set((shops ?? []).map((s) => s.id)), [shops]);
  const activeProducts = useMemo(
    () => (products ?? []).filter((p) => p.status === 'active' && myShopIds.has(p.shopId)),
    [products, myShopIds],
  );
  const activeProperties = useMemo(
    () => (properties ?? []).filter((p) => p.status === 'active'),
    [properties],
  );
  const hasListings = activeProducts.length > 0 || activeProperties.length > 0;

  const { data: boostData } = useBoosts();
  const tiers = boostData?.tiers ?? [];
  const wallet = useWallet();
  const create = useCreateBoost();

  // Pre-select when arriving from a listing's edit screen ("Booster cette
  // annonce"). Either productId or propertyId is passed; falls back to the
  // manual picker otherwise.
  const { productId: preProduct, propertyId: preProperty } =
    useLocalSearchParams<{ productId?: string; propertyId?: string }>();
  const [selected, setSelected] = useState<Selection | null>(
    typeof preProperty === 'string'
      ? { kind: 'property', id: preProperty }
      : typeof preProduct === 'string'
        ? { kind: 'product', id: preProduct }
        : null,
  );
  const [days, setDays] = useState<number | null>(null);
  const selectedTier = tiers.find((x) => x.days === days) ?? null;
  const [method, setMethod] = useState<BoostPayMethod>('wallet');

  const onPay = async () => {
    if (!selected || !selectedTier || create.isPending) return;
    try {
      haptic.medium();
      const target =
        selected.kind === 'property'
          ? { propertyId: selected.id }
          : { productId: selected.id };
      const res = await create.mutateAsync({ ...target, days: selectedTier.days, method });

      // Mobile money : rien n'est paye a cet instant. On ouvre la page Lengopay
      // dans l'app ; le boost ne s'activera qu'au retour, quand le cron aura vu
      // l'encaissement. Surtout pas de toast de succes ici.
      if (res.kind === 'redirect') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`.
        router.replace({ pathname: '/checkout/pay', params: { url: res.paymentUrl, boostId: res.boostId } } as any);
        return;
      }

      toast.show(t('pro.boostSuccessToast'), 'success');
      router.replace('/pro/boost');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_FUNDS') {
        toast.show(t('pro.boostInsufficientBody'), 'danger');
        return;
      }
      toast.show(toToastMessage(e, t('pro.boostErrorToast')), 'danger');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('pro.boostNewTitle')} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 40 }}>
        <Text tone="muted" variant="micro" style={{ letterSpacing: 0, textTransform: 'none' }}>
          {t('pro.boostWalletBalance', { balance: formatGNF(wallet.data?.balanceGnf ?? 0) })}
        </Text>

        <View style={{ gap: 10 }}>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0.5 }}>
            {t('pro.boostPickListing').toUpperCase()}
          </Text>
          {!hasListings ? (
            <View
              style={{
                padding: 20,
                borderRadius: 16,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Text tone="muted" center style={{ letterSpacing: 0, textTransform: 'none' }}>
                {t('pro.boostNoListings')}
              </Text>
              <Button
                label={t('pro.boostGoCreate')}
                variant="secondary"
                onPress={() => router.replace('/create')}
              />
            </View>
          ) : (
            <>
              {activeProducts.map((p) => (
                <ListingOption
                  key={`prod-${p.id}`}
                  title={p.title}
                  subtitle={formatGNF(p.priceGnf)}
                  kindLabel={t('proDashboard.kindProduct')}
                  photo={p.photos?.[0]}
                  selected={selected?.kind === 'product' && selected.id === p.id}
                  onSelect={() => {
                    haptic.light();
                    setSelected({ kind: 'product', id: p.id });
                  }}
                />
              ))}
              {activeProperties.map((p) => (
                <ListingOption
                  key={`prop-${p.id}`}
                  title={p.title}
                  subtitle={formatGNF(p.priceGnf)}
                  kindLabel={t('proDashboard.kindProperty')}
                  photo={p.photos?.[0]}
                  selected={selected?.kind === 'property' && selected.id === p.id}
                  onSelect={() => {
                    haptic.light();
                    setSelected({ kind: 'property', id: p.id });
                  }}
                />
              ))}
            </>
          )}
        </View>

        {hasListings && (
          <View style={{ gap: 10 }}>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0.5 }}>
              {t('pro.boostPickDuration').toUpperCase()}
            </Text>
            {tiers.map((tier) => (
              <DurationOption
                key={tier.days}
                label={t('pro.boostDays', { count: tier.days })}
                price={formatGNF(tier.amountGnf)}
                selected={tier.days === days}
                onSelect={() => {
                  haptic.light();
                  setDays(tier.days);
                }}
              />
            ))}
          </View>
        )}

        {hasListings && (
          <View style={{ gap: 10 }}>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0.5 }}>
              {t('pro.boostPickMethod').toUpperCase()}
            </Text>
            {PAY_METHODS.map((m) => (
              <PayMethodOption
                key={m.id}
                name={t(m.nameKey)}
                hint={
                  m.id === 'wallet'
                    ? t('pro.boostMethodWalletHint', { balance: formatGNF(wallet.data?.balanceGnf ?? 0) })
                    : t('pro.boostMethodMomoHint')
                }
                badge={m.badge}
                badgeColor={m.badgeColor}
                badgeFg={m.badgeFg}
                logo={m.logo}
                selected={method === m.id}
                onSelect={() => {
                  haptic.light();
                  setMethod(m.id);
                }}
              />
            ))}
          </View>
        )}

        {hasListings && (
          <Button
            label={
              selectedTier
                ? t('pro.boostPayCta', { price: formatGNF(selectedTier.amountGnf) })
                : t('pro.boostNewCta')
            }
            block
            variant="primary"
            disabled={!selected || !selectedTier || create.isPending}
            loading={create.isPending}
            onPress={() => void onPay()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ListingOption({
  title,
  subtitle,
  kindLabel,
  photo,
  selected,
  onSelect,
}: {
  title: string;
  subtitle: string;
  kindLabel: string;
  photo?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onSelect}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 16,
        backgroundColor: colors.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
      }}
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.bgSunken }}
          contentFit="cover"
        />
      ) : (
        <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.bgSunken }} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.4 }}>
          {kindLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: '700', color: colors.text, letterSpacing: 0, marginTop: 1 }}
        >
          {title}
        </Text>
        <Text tone="muted" variant="micro" style={{ letterSpacing: 0, textTransform: 'none', marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.border,
          backgroundColor: selected ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

/** Tuile de rail. Meme traitement visuel que l'ecran de paiement : le logo
 *  occupe toute la tuile blanche (contentFit cover, aucun rembourrage), sinon
 *  les marques flottent au milieu d'un carre vide. Repli sur des initiales
 *  colorees quand il n'y a pas d'image — le portefeuille n'en a pas. */
function PayMethodOption({
  name, hint, badge, badgeColor, badgeFg, logo, selected, onSelect,
}: {
  name: string;
  hint: string;
  badge: string;
  badgeColor: string;
  badgeFg?: string;
  logo?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onSelect}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 16,
        backgroundColor: selected ? colors.primarySoft : colors.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: logo ? '#FFFFFF' : badgeColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {logo ? (
          <Image source={logo} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: 15, fontWeight: '800', color: badgeFg ?? '#FFFFFF', letterSpacing: 0 }}>
            {badge}
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, letterSpacing: 0 }}>
          {name}
        </Text>
        <Text tone="muted" variant="micro" style={{ letterSpacing: 0, textTransform: 'none', marginTop: 2 }}>
          {hint}
        </Text>
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.border,
          backgroundColor: selected ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

function DurationOption({
  label,
  price,
  selected,
  onSelect,
}: {
  label: string;
  price: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onSelect}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 16,
        backgroundColor: selected ? colors.primarySoft : colors.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: 0 }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 15,
          fontWeight: '700',
          color: selected ? colors.primaryDeep : colors.text,
          letterSpacing: 0,
        }}
      >
        {price}
      </Text>
    </Pressable>
  );
}
