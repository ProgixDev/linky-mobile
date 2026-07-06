import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button, IconButton } from '../../src/components/primitives/Button';
import { TopBar } from '../../src/components/nav/TopBar';
import { WalletGlanceCard } from '../../src/components/lists/WalletCard';
import { I } from '../../src/icons/Icon';
import { formatGNF } from '../../src/lib/format';
import { useWallet, useMyWithdrawals, type WithdrawalRequestItem } from '../../src/data/queries';
import { Skeleton } from '../../src/components/primitives/Skeleton';
import { ErrorStateView } from '../../src/components/feedback/EmptyState';
import { P2P_SEND_ENABLED, WALLET_TOPUP_ENABLED } from '../../src/lib/flags';

// Phase I.8 — STATUS_LABEL carries i18n keys only ; the row resolves them
// with t() at render so the chips flip language live.
const STATUS_LABEL_KEY: Record<string, string> = {
  received: 'wallet.movementStatus.received',
  escrow: 'wallet.movementStatus.escrow',
  completed: 'wallet.movementStatus.completed',
  pending: 'wallet.movementStatus.pending',
};

// Withdrawal chips per status. 'approved' is an intermediate the V1 manual
// flow doesn't produce ; map it to the waiting label just in case.
const WITHDRAWAL_STATUS_META: Record<WithdrawalRequestItem['status'], { labelKey: string; tone: 'wait' | 'ok' | 'bad' | 'off' }> = {
  pending: { labelKey: 'wallet.withdrawalStatusLabel.pending', tone: 'wait' },
  approved: { labelKey: 'wallet.withdrawalStatusLabel.approved', tone: 'wait' },
  paid: { labelKey: 'wallet.withdrawalStatusLabel.paid', tone: 'ok' },
  rejected: { labelKey: 'wallet.withdrawalStatusLabel.rejected', tone: 'bad' },
  cancelled: { labelKey: 'wallet.withdrawalStatusLabel.cancelled', tone: 'off' },
};

export default function WalletRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const walletQuery = useWallet();
  const withdrawalsQuery = useMyWithdrawals();
  const wallet = walletQuery.data;
  const myWithdrawals = withdrawalsQuery.data;
  const [tab, setTab] = useState<'movements' | 'pending'>('movements');

  const onRefresh = useCallback(async () => {
    await Promise.all([walletQuery.refetch(), withdrawalsQuery.refetch()]);
  }, [walletQuery, withdrawalsQuery]);

  // Phase T.4 — error state distinguished from loading. Pre-T4, an
  // API failure on /wallet-balance kept this screen in the skeleton
  // loop forever ("if (isLoading || !wallet) return skeleton") — the
  // single most trust-sensitive surface in the app had no error
  // affordance at all.
  if (walletQuery.isError) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('wallet.title')} back />
        <ErrorStateView onRetry={() => walletQuery.refetch()} />
      </SafeAreaView>
    );
  }

  if (walletQuery.isLoading || !wallet) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('wallet.title')} back />
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={160} radius={16} />
          <Skeleton height={16} />
          <Skeleton height={16} />
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = (s: string) =>
    s === 'received' ? colors.success : s === 'escrow' ? colors.info : colors.textMuted;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title={t('wallet.title')}
        back
        right={
          // Phase U.0 should-fix — was IconButton with no onPress ; wired to /scan.
          <IconButton
            variant="secondary"
            size={36}
            onPress={() => router.push('/scan')}
            accessibilityLabel={t('wallet.scanQr')}
          >
            <I.qr size={16} color={colors.text} />
          </IconButton>
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={walletQuery.isFetching && !walletQuery.isLoading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={{ paddingHorizontal: 16 }}>
          <WalletGlanceCard
            balanceGnf={wallet.balanceGnf}
            large
            onRecharger={WALLET_TOPUP_ENABLED ? () => router.push('/wallet/recharger') : undefined}
            onRetirer={() => router.push('/wallet/retirer')}
            // P2P send is gated OFF for shipped builds — see
            // WALLET_SEND_V1_1_BACKLOG.md. When undefined, WalletGlanceCard
            // skips rendering the Envoyer button entirely.
            onEnvoyer={P2P_SEND_ENABLED ? () => router.push('/wallet/envoyer' as never) : undefined}
          />
        </View>

        <View style={{ marginTop: 18, paddingHorizontal: 16, flexDirection: 'row', gap: 18, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {(['movements', 'pending'] as const).map((tabId) => {
            const active = tab === tabId;
            return (
              <Pressable key={tabId} onPress={() => setTab(tabId)} style={{ paddingBottom: 12, borderBottomWidth: active ? 2 : 0, borderBottomColor: colors.primary }}>
                <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? colors.text : colors.textMuted }}>
                  {tabId === 'movements' ? t('wallet.tabMovements') : t('wallet.tabWithdrawals')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'pending' && (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            {/* Phase U.0-B7 — withdrawalsQuery failing (independent fn from
                wallet-balance) used to render "Aucun retrait pour le
                moment." even to a seller with an in-flight withdrawal.
                Branch on isError → ErrorStateView with its own retry. */}
            {withdrawalsQuery.isError ? (
              <View style={{ paddingVertical: 12 }}>
                <ErrorStateView onRetry={() => void withdrawalsQuery.refetch()} />
              </View>
            ) : withdrawalsQuery.isLoading ? (
              <View style={{ gap: 12, paddingVertical: 8 }}>
                <Skeleton height={48} radius={8} />
                <Skeleton height={48} radius={8} />
              </View>
            ) : (myWithdrawals ?? []).length === 0 ? (
              <Text variant="bodyM" tone="muted" style={{ textAlign: 'center', paddingVertical: 24 }}>
                {t('wallet.noWithdrawals')}
              </Text>
            ) : (
              (myWithdrawals ?? []).map((w) => {
                const stMeta = WITHDRAWAL_STATUS_META[w.status];
                const st = { ...stMeta, label: t(stMeta.labelKey) };
                const chipColor =
                  st.tone === 'ok' ? colors.success
                  : st.tone === 'bad' ? colors.danger
                  : st.tone === 'wait' ? colors.info
                  : colors.textMuted;
                return (
                  <View
                    key={w.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        backgroundColor: colors.bgSunken,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <I.upload size={16} color={colors.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600' }}>
                        {w.destination
                          ? t('wallet.withdrawalTo', { destination: w.destination })
                          : t('wallet.withdrawal')}
                      </Text>
                      <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                        {new Date(w.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {w.status === 'rejected' && w.reason ? ` · ${w.reason}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text style={{ fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] }}>
                        {formatGNF(Number(w.amount_minor))}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 999,
                          backgroundColor: colors.bgSunken,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: chipColor }}>
                          {st.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ paddingHorizontal: 16, paddingTop: 12, display: tab === 'movements' ? 'flex' : 'none' }}>
          {/* Phase U.0 should-fix — new wallets used to see a blank area. */}
          {wallet.movements.length === 0 && (
            <Text variant="bodyM" tone="muted" style={{ textAlign: 'center', paddingVertical: 24 }}>
              {t('wallet.noMovements')}
            </Text>
          )}
          {wallet.movements.map((m) => (
            <View
              key={m.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  backgroundColor: m.direction === 'in' ? colors.primarySoft : colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {m.direction === 'in' ? (
                  <I.download size={16} color={colors.primary} />
                ) : (
                  <I.upload size={16} color={colors.text} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600' }}>{m.label}</Text>
                <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                  {new Date(m.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  <Text style={{ color: statusColor(m.status) }}>
                    {STATUS_LABEL_KEY[m.status] ? t(STATUS_LABEL_KEY[m.status]) : m.status}
                  </Text>
                </Text>
              </View>
              <Text
                style={{
                  fontWeight: '600',
                  fontSize: 14,
                  fontVariant: ['tabular-nums'],
                  color: m.amountGnf > 0 ? colors.success : colors.text,
                }}
              >
                {m.amountGnf > 0 ? '+' : ''}
                {formatGNF(m.amountGnf)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
