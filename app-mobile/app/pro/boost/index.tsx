// Boost home — the seller's boost history + a CTA to buy a new one. Replaces
// the Phase T.3 "Bientôt disponible" placeholder now that the boost module is
// wired (migration 20260701_01 + create/list/get-boost).
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
import { ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { formatGNF } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';
import { useBoosts } from '../../../src/data/queries';
import type { Boost } from '../../../src/data/types';

function isLive(b: Boost): boolean {
  return b.status === 'active' && new Date(b.endsAt).getTime() > Date.now();
}
function daysLeft(endsAt: string): number {
  return Math.max(1, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000));
}

export default function BoostIndex() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const q = useBoosts();
  const boosts = q.data?.boosts ?? [];
  const tiers = q.data?.tiers ?? [];
  const cheapest = tiers.length ? Math.min(...tiers.map((x) => x.amountGnf)) : null;

  // Retour de la page Lengopay : le boost paye par mobile money n'existe pas
  // encore ici — il est 'pending_payment' et list-boosts le masque. C'est le
  // cron qui l'activera, en quelques secondes. On rafraichit donc en boucle
  // pendant une minute plutot que de laisser le vendeur devant une liste
  // inchangee, croyant avoir paye dans le vide.
  const { pending } = useLocalSearchParams<{ pending?: string }>();
  const [awaiting, setAwaiting] = useState(pending === '1');
  const countRef = useRef(boosts.length);
  useEffect(() => {
    if (!awaiting) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 60_000) {
        setAwaiting(false);
        return;
      }
      void q.refetch();
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- q change a chaque rendu ; la boucle ne depend que de `awaiting`.
  }, [awaiting]);
  useEffect(() => {
    // Le boost est apparu : on arrete d'interroger.
    if (awaiting && boosts.length > countRef.current) setAwaiting(false);
    countRef.current = boosts.length;
  }, [boosts.length, awaiting]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={q.isFetching && !q.isLoading}
            onRefresh={() => void q.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <ScreenHeader title={t('pro.boostScreenTitle')} subtitle={t('pro.boostSubtitle')} />

        <View style={{ paddingHorizontal: 20 }}>
          {awaiting && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                marginBottom: 12,
                borderRadius: 14,
                backgroundColor: colors.primarySoft,
                borderWidth: 1,
                borderColor: colors.primary,
              }}
            >
              <Zap size={16} color={colors.primaryDeep} strokeWidth={2.4} />
              <Text
                variant="micro"
                style={{ flex: 1, color: colors.primaryDeep, letterSpacing: 0, textTransform: 'none', lineHeight: 16 }}
              >
                {t('pro.boostPendingBanner')}
              </Text>
            </View>
          )}
          <Button
            label={t('pro.boostNewCta')}
            block
            variant="primary"
            onPress={() => {
              haptic.light();
              router.push('/pro/boost/new');
            }}
          />
          {cheapest != null ? (
            <Text
              tone="muted"
              variant="micro"
              center
              style={{ marginTop: 8, letterSpacing: 0, textTransform: 'none' }}
            >
              {t('pro.boostFrom', { price: formatGNF(cheapest) })}
            </Text>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 26 }}>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0.5 }}>
            {t('pro.boostHistoryTitle').toUpperCase()}
          </Text>

          {q.isLoading ? (
            <View style={{ gap: 10, paddingTop: 12 }}>
              <Skeleton height={72} radius={16} />
              <Skeleton height={72} radius={16} />
            </View>
          ) : q.isError && boosts.length === 0 ? (
            <View style={{ paddingTop: 16 }}>
              <ErrorStateView onRetry={() => void q.refetch()} />
            </View>
          ) : boosts.length === 0 ? (
            <View style={{ paddingTop: 22, paddingBottom: 8, alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                {t('pro.boostEmptyTitle')}
              </Text>
              <Text
                tone="muted"
                center
                style={{ maxWidth: 300, letterSpacing: 0, textTransform: 'none' }}
              >
                {t('pro.boostEmptyBody')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10, paddingTop: 12 }}>
              {boosts.map((b) => (
                <BoostRow key={b.id} boost={b} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BoostRow({ boost }: { boost: Boost }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const live = isLive(boost);
  const statusLabel = live
    ? t('pro.boostRemaining', { count: daysLeft(boost.endsAt) })
    : boost.status === 'cancelled'
      ? t('pro.boostStatusCancelled')
      : t('pro.boostStatusExpired');
  const pillBg = live ? colors.primarySoft : colors.bgSunken;
  const pillFg = live ? colors.primaryDeep : colors.textMuted;

  return (
    <Pressable
      onPress={() => {
        haptic.light();
        router.push(`/pro/boost/${boost.id}`);
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          backgroundColor: live ? colors.accentSoft : colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Zap size={18} color={live ? colors.accentText : colors.textMuted} strokeWidth={2.25} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: '700', color: colors.text, letterSpacing: 0 }}
        >
          {boost.listing?.title ?? boost.product?.title ?? '—'}
        </Text>
        <Text
          tone="muted"
          variant="micro"
          style={{ letterSpacing: 0, textTransform: 'none', marginTop: 2 }}
        >
          {t('pro.boostDays', { count: boost.days })} · {formatGNF(boost.amountGnf)}
        </Text>
      </View>
      <View
        style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: pillBg }}
      >
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: pillFg, letterSpacing: 0.2 }}>
          {statusLabel}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textFaint} strokeWidth={2} />
    </Pressable>
  );
}
