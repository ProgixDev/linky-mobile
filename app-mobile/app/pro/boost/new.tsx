// Buy a boost — pick one of your active products, pick a duration tier, pay
// from the wallet. Price is server-authoritative (create-boost re-derives it
// from days); this screen only sends { productId, days }. Insufficient balance
// routes to the recharge flow.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
import { ApiError } from '../../../src/lib/api';
import {
  useBoosts,
  useCreateBoost,
  useMyShops,
  useProducts,
  useWallet,
} from '../../../src/data/queries';
import type { Product } from '../../../src/data/types';

export default function BoostNewRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();

  const { data: shops } = useMyShops();
  const myShop = shops?.[0];
  const { data: products } = useProducts({ shopId: myShop?.id });
  const activeProducts = useMemo(
    () => (products ?? []).filter((p) => p.status === 'active'),
    [products],
  );
  const { data: boostData } = useBoosts();
  const tiers = boostData?.tiers ?? [];
  const wallet = useWallet();
  const create = useCreateBoost();

  const [productId, setProductId] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const selectedTier = tiers.find((x) => x.days === days) ?? null;

  const onPay = async () => {
    if (!productId || !selectedTier || create.isPending) return;
    try {
      haptic.medium();
      await create.mutateAsync({ productId, days: selectedTier.days });
      toast.show(t('pro.boostSuccessToast'), 'success');
      router.replace('/pro/boost');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_FUNDS') {
        // Top-up removed (wallet restructure) — the wallet is funded by sales
        // earnings only, so there is no recharge screen to send the seller to.
        toast.show(t('pro.boostInsufficientBody'), 'danger');
        return;
      }
      toast.show(e instanceof ApiError ? e.message_fr : t('pro.boostErrorToast'), 'danger');
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
            {t('pro.boostPickProduct').toUpperCase()}
          </Text>
          {activeProducts.length === 0 ? (
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
                {t('pro.boostNoProducts')}
              </Text>
              <Button
                label={t('pro.boostGoCreate')}
                variant="secondary"
                onPress={() => router.replace('/create')}
              />
            </View>
          ) : (
            activeProducts.map((p) => (
              <ProductOption
                key={p.id}
                product={p}
                selected={p.id === productId}
                onSelect={() => {
                  haptic.light();
                  setProductId(p.id);
                }}
              />
            ))
          )}
        </View>

        {activeProducts.length > 0 && (
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

        {activeProducts.length > 0 && (
          <Button
            label={
              selectedTier
                ? t('pro.boostPayCta', { price: formatGNF(selectedTier.amountGnf) })
                : t('pro.boostNewCta')
            }
            block
            variant="primary"
            disabled={!productId || !selectedTier || create.isPending}
            loading={create.isPending}
            onPress={() => void onPay()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProductOption({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const photo = product.photos?.[0];
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
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: '700', color: colors.text, letterSpacing: 0 }}
        >
          {product.title}
        </Text>
        <Text tone="muted" variant="micro" style={{ letterSpacing: 0, textTransform: 'none', marginTop: 2 }}>
          {formatGNF(product.priceGnf)}
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
