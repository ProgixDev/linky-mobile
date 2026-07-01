// Boost detail — status banner + the product it promotes + purchase facts.
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { TopBar } from '../../../src/components/nav/TopBar';
import { DetailStateScreen } from '../../../src/components/feedback/DetailState';
import { formatGNF } from '../../../src/lib/format';
import { useBoost } from '../../../src/data/queries';
import type { Boost } from '../../../src/data/types';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function isLive(b: Boost): boolean {
  return b.status === 'active' && new Date(b.endsAt).getTime() > Date.now();
}

export default function BoostDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data: boost, isLoading, isError, refetch } = useBoost(id);

  if (isLoading || isError || !boost) {
    return (
      <DetailStateScreen
        loading={isLoading}
        title={t('pro.boostDetailNotFound')}
        onRetry={() => void refetch()}
      />
    );
  }

  const live = isLive(boost);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('pro.boostDetailTitle')} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: 16,
            backgroundColor: live ? colors.primarySoft : colors.bgSunken,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: live ? colors.accentSoft : colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={20} color={live ? colors.accentText : colors.textMuted} strokeWidth={2.25} />
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: '700',
              color: live ? colors.primaryDeep : colors.textMuted,
              letterSpacing: 0,
            }}
          >
            {live ? t('pro.boostDetailActiveBanner') : t('pro.boostDetailExpiredBanner')}
          </Text>
        </View>

        {boost.product ? (
          <Pressable
            onPress={() => router.push(`/product/${boost.productId}`)}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
          >
            {boost.product.photo ? (
              <Image
                source={{ uri: boost.product.photo }}
                style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.bgSunken }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.bgSunken }}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={2}
                style={{ fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: 0 }}
              >
                {boost.product.title}
              </Text>
              <Text
                tone="muted"
                variant="micro"
                style={{ letterSpacing: 0, textTransform: 'none', marginTop: 3 }}
              >
                {t('pro.boostDetailViewProduct')}
              </Text>
            </View>
          </Pressable>
        ) : null}

        <View
          style={{
            borderRadius: 16,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <DetailRow label={t('pro.boostDetailDuration')} value={t('pro.boostDays', { count: boost.days })} />
          <DetailRow label={t('pro.boostDetailAmount')} value={formatGNF(boost.amountGnf)} />
          <DetailRow label={t('pro.boostDetailStart')} value={fmtDate(boost.startsAt)} />
          <DetailRow label={t('pro.boostDetailEnd')} value={fmtDate(boost.endsAt)} last />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
        {label}
      </Text>
      <Text style={{ fontWeight: '700', color: colors.text, letterSpacing: 0 }}>{value}</Text>
    </View>
  );
}
