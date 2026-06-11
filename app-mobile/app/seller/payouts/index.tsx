// Phase T.3 — real seller payouts. Pre-T3 this screen rendered a hardcoded
// PAYOUTS array (fake 432 600 GNF pending, fake Orange/MTN payouts) linked
// from BOTH dashboards — the single worst trust hazard on the app.
//
// New shape:
//   - Hero = wallet balance (useWallet), the actual money the seller owns
//     today (after sales + minus prior withdrawals).
//   - List = useMyWithdrawals (Phase S), the only real "payout" history.
//     Statuses: pending / paid / rejected / cancelled.
//   - CTA  = "Retirer" → /wallet/retirer (the existing withdrawal flow).
//
// No "pending payout" computation — V1 doesn't auto-batch sales into payouts.
// Every payout is a manual withdrawal request the seller files themselves.
import { ScrollView, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Wallet,
  ArrowDownToLine,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { NoiseOverlay } from '../../../src/components/visuals/NoiseOverlay';
import { EmptyState, ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { haptic } from '../../../src/lib/haptics';
import { formatGNF } from '../../../src/lib/format';
import {
  useWallet,
  useMyWithdrawals,
  type WithdrawalRequestItem,
} from '../../../src/data/queries/wallet';

const STATUS_LABEL: Record<WithdrawalRequestItem['status'], string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  paid: 'Payé',
  rejected: 'Refusé',
  cancelled: 'Annulé',
};

function statusVisual(s: WithdrawalRequestItem['status']) {
  if (s === 'paid') return { Icon: CheckCircle2, tint: 'success' as const };
  if (s === 'rejected' || s === 'cancelled') return { Icon: XCircle, tint: 'danger' as const };
  return { Icon: Clock, tint: 'pending' as const };
}

export default function PayoutsRoute() {
  const { colors } = useTheme();
  const wallet = useWallet();
  const withdrawals = useMyWithdrawals();

  const balanceGnf = wallet.data?.balanceGnf ?? 0;
  const items = withdrawals.data ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader title="Retraits" subtitle="L'argent libéré atterrit sur ton Mobile Money." />

        {/* Hero — solde disponible */}
        <View style={{ paddingHorizontal: 24 }}>
          <View style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: '#0A5240' }}>
            <LinearGradient
              colors={['#118866', '#0A5240', '#063929']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
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
            <NoiseOverlay />
            <View style={{ padding: 20 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: 'rgba(255,255,255,0.65)',
                  letterSpacing: 0.5,
                }}
              >
                SOLDE DISPONIBLE
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                <Text
                  style={{
                    fontSize: 34,
                    fontWeight: '700',
                    color: '#FFFFFF',
                    fontVariant: ['tabular-nums'],
                    letterSpacing: -0.6,
                    lineHeight: 38,
                    includeFontPadding: false,
                  }}
                >
                  {formatGNF(balanceGnf).replace(' GNF', '')}
                </Text>
                <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>
                  GNF
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  haptic.light();
                  router.push('/wallet/retirer');
                }}
                style={{
                  marginTop: 16,
                  alignSelf: 'flex-start',
                  height: 40,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  backgroundColor: '#FFFFFF',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <ArrowDownToLine size={14} color="#0A5240" strokeWidth={2.5} />
                <Text style={{ color: '#0A5240', fontWeight: '700', fontSize: 13.5 }}>
                  Retirer
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* History — pending first */}
        <View style={{ paddingHorizontal: 24, paddingTop: 22, gap: 10 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.textFaint,
              letterSpacing: 0.6,
              marginLeft: 4,
              marginBottom: 4,
            }}
          >
            HISTORIQUE
          </Text>

          {withdrawals.isError && (
            <View style={{ paddingVertical: 28 }}>
              <ErrorStateView onRetry={() => withdrawals.refetch()} />
            </View>
          )}

          {!withdrawals.isError && withdrawals.isLoading && (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginLeft: 4 }}>
              Chargement…
            </Text>
          )}

          {!withdrawals.isError && !withdrawals.isLoading && items.length === 0 && (
            <View style={{ paddingVertical: 28 }}>
              <EmptyState
                icon="package"
                title="Aucun retrait pour le moment"
                description="Quand tes ventes seront libérées, tu pourras les transférer vers ton Mobile Money."
                ctaLabel={balanceGnf > 0 ? 'Faire mon premier retrait' : undefined}
                onCta={balanceGnf > 0 ? () => router.push('/wallet/retirer') : undefined}
              />
            </View>
          )}

          {items.map((w) => (
            <WithdrawalRow key={w.id} item={w} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function WithdrawalRow({ item }: { item: WithdrawalRequestItem }) {
  const { colors } = useTheme();
  const { Icon, tint } = statusVisual(item.status);
  const palette =
    tint === 'success'
      ? { bg: colors.primarySoft, fg: colors.primary }
      : tint === 'danger'
        ? { bg: 'rgba(209,79,60,0.1)', fg: colors.danger }
        : { bg: colors.accentSoft, fg: colors.accentText };
  const dateStr = new Date(item.decided_at ?? item.created_at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: palette.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} color={palette.fg} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: colors.text,
            fontVariant: ['tabular-nums'],
            letterSpacing: 0,
            lineHeight: 18,
            includeFontPadding: false,
          }}
        >
          {formatGNF(item.amount_minor)}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
            letterSpacing: 0,
          }}
          numberOfLines={1}
        >
          {STATUS_LABEL[item.status]}
          {item.destination ? ` · ${item.destination}` : ''}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: palette.fg,
          letterSpacing: 0,
        }}
      >
        {dateStr}
      </Text>
    </View>
  );
}
