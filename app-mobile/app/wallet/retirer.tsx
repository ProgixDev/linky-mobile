import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { Chip } from '../../src/components/primitives/Chip';
import { TopBar } from '../../src/components/nav/TopBar';
import { StickyBottom } from '../../src/components/nav/StickyBottom';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { Input } from '../../src/components/primitives/Input';
import { EmptyState, ErrorStateView } from '../../src/components/feedback/EmptyState';
import { Skeleton } from '../../src/components/primitives/Skeleton';
import { I } from '../../src/icons/Icon';
import { formatGNF } from '../../src/lib/format';
import { useToast } from '../../src/components/feedback/Toast';
import { useWithdrawWallet, useWallet } from '../../src/data/queries';
import { toToastMessage } from '../../src/lib/api';
import { haptic } from '../../src/lib/haptics';

type Operator = 'Orange Money' | 'MTN Mobile Money';

// Brand tints for the two rails so the picker reads at a glance (was a generic
// grey phone icon for both — visually identical, easy to mis-tap).
const OPERATORS: { id: Operator; short: string; tint: string }[] = [
  { id: 'Orange Money', short: 'Orange', tint: '#FF7900' },
  { id: 'MTN Mobile Money', short: 'MTN', tint: '#FFCC00' },
];

const QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000];

// Guinea mobile numbers are 9 digits beginning with 6. Strip a pasted +224 /
// 224 country code so the user can paste from anywhere.
function normalizeGnPhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('224')) d = d.slice(3);
  return d.slice(0, 9);
}
function formatGnPhone(d: string): string {
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

function OperatorRow({
  op,
  active,
  onPress,
  divider,
}: {
  op: (typeof OPERATORS)[number];
  active: boolean;
  onPress: () => void;
  divider: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={op.id}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.bg : colors.card,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          backgroundColor: op.tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#1A1205', fontSize: 12, fontWeight: '800', letterSpacing: 0.2 }}>{op.short}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{op.id}</Text>
        <Text variant="caption" tone="muted" style={{ letterSpacing: 0 }}>
          {t('wallet.retirer.destSub', { short: op.short })}
        </Text>
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          backgroundColor: active ? colors.primary : 'transparent',
          borderWidth: active ? 0 : 1.5,
          borderColor: colors.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {active && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
      </View>
    </Pressable>
  );
}

export default function RetirerRoute() {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const { show } = useToast();
  const withdraw = useWithdrawWallet();
  const walletQuery = useWallet();

  const [amount, setAmount] = useState(0);
  const [operator, setOperator] = useState<Operator>('Orange Money');
  const [phone, setPhone] = useState('');

  const balance = walletQuery.data?.balanceGnf ?? 0;
  const phoneValid = phone.length === 9 && phone.startsWith('6');
  const exceedsBalance = amount > balance;
  const canSubmit = amount > 0 && !exceedsBalance && phoneValid && !withdraw.isPending;

  // ── Loading ────────────────────────────────────────────────────────────
  if (walletQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('wallet.retirer.topbar')} back />
        <View style={{ padding: 16, gap: 14 }}>
          <Skeleton height={96} radius={16} />
          <Skeleton height={120} radius={16} />
          <Skeleton height={140} radius={16} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (walletQuery.isError) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('wallet.retirer.topbar')} back />
        <ErrorStateView onRetry={() => void walletQuery.refetch()} />
      </SafeAreaView>
    );
  }

  // ── Nothing to withdraw ────────────────────────────────────────────────
  if (balance <= 0) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('wallet.retirer.topbar')} back />
        <EmptyState
          icon="wallet"
          title={t('wallet.retirer.emptyTitle')}
          description={t('wallet.retirer.emptyDesc')}
          ctaLabel={t('wallet.retirer.emptyCta')}
          onCta={() => (router.canGoBack() ? router.back() : router.replace('/wallet'))}
        />
      </SafeAreaView>
    );
  }

  const quick = QUICK_AMOUNTS.filter((v) => v <= balance);

  function submit() {
    haptic.success();
    const destination = `${operator} — ${formatGnPhone(phone)}`;
    withdraw.mutate(
      { amountGnf: amount, destination },
      {
        onSuccess: () => {
          show(t('wallet.retirer.successToast'), 'success');
          router.back();
        },
        onError: (e) => show(toToastMessage(e, t('wallet.retirer.errorToast')), 'danger'),
      },
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('wallet.retirer.topbar')} back />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
      >
        {/* Balance anchor */}
        <View
          style={{
            backgroundColor: colors.primarySoft,
            borderRadius: 16,
            paddingVertical: 16,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginBottom: 20,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <I.wallet size={18} color={colors.primary} />
          </View>
          <View>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
              {t('wallet.retirer.balanceLabel')}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primaryDeep, fontVariant: ['tabular-nums'] }}>
              {formatGNF(balance)}
            </Text>
          </View>
        </View>

        {/* Amount — editable, not just 3 fixed chips */}
        <MicroLabel label={t('wallet.retirer.amountLabel')} />
        <View
          style={{
            backgroundColor: colors.bgElev,
            borderRadius: 16,
            paddingVertical: 22,
            paddingHorizontal: 20,
            borderWidth: 1,
            borderColor: exceedsBalance ? colors.danger : colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TextInput
            value={amount > 0 ? new Intl.NumberFormat('fr-FR').format(amount) : ''}
            onChangeText={(txt) => {
              const n = Number(txt.replace(/\D/g, ''));
              setAmount(Number.isFinite(n) ? n : 0);
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.textFaint}
            maxLength={11}
            accessibilityLabel={t('wallet.retirer.accessAmount')}
            style={{
              fontSize: 36,
              fontWeight: '700',
              color: exceedsBalance ? colors.danger : colors.text,
              textAlign: 'center',
              minWidth: 60,
              paddingVertical: 0,
              fontVariant: ['tabular-nums'],
            }}
          />
          <Text style={{ marginLeft: 8, marginTop: 8, color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>
            GNF
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {quick.map((v) => (
            <Chip
              key={v}
              label={new Intl.NumberFormat('fr-FR').format(v)}
              active={v === amount}
              onPress={() => setAmount(v)}
            />
          ))}
          <Chip label={t('wallet.retirer.allChip')} variant="soft" active={amount === balance} onPress={() => setAmount(balance)} />
        </View>

        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: 12, letterSpacing: 0, color: exceedsBalance ? colors.danger : undefined }}
        >
          {exceedsBalance
            ? t('wallet.retirer.insufficient', { balance: formatGNF(balance) })
            : t('wallet.retirer.remainingAfter', { remaining: formatGNF(balance - amount) })}
        </Text>

        {/* Destination — operator + the number money is actually sent to */}
        <View style={{ marginTop: 22 }}>
          <MicroLabel label={t('wallet.retirer.destLabel')} />
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {OPERATORS.map((op, i) => (
              <OperatorRow
                key={op.id}
                op={op}
                active={operator === op.id}
                onPress={() => setOperator(op.id)}
                divider={i < OPERATORS.length - 1}
              />
            ))}
          </View>

          <View style={{ marginTop: 12 }}>
            <Input
              label={t('wallet.retirer.phoneInputLabel', { operator: operator === 'Orange Money' ? 'Orange Money' : 'MTN' })}
              leadingIcon="phone"
              keyboardType="phone-pad"
              placeholder={t('wallet.retirer.phonePlaceholder')}
              value={formatGnPhone(phone)}
              onChangeText={(txt) => setPhone(normalizeGnPhone(txt))}
              errorText={
                phone.length > 0 && !phoneValid ? t('wallet.retirer.phoneInvalid') : undefined
              }
              helperText={phone.length === 0 ? t('wallet.retirer.phoneHint') : undefined}
            />
          </View>
        </View>

        {/* Expectation-setting — V1 payout is manual, ~24h. Honest framing. */}
        <View
          style={{
            marginTop: 18,
            flexDirection: 'row',
            gap: 10,
            padding: 12,
            borderRadius: radii.md,
            backgroundColor: colors.bgSunken,
          }}
        >
          <I.shield size={16} color={colors.textMuted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, letterSpacing: 0, lineHeight: 18 }}>
            {t('wallet.retirer.infoNote')}
          </Text>
        </View>
      </ScrollView>

      <StickyBottom>
        {canSubmit && (
          <Text variant="caption" tone="muted" style={{ textAlign: 'center', marginBottom: 8, letterSpacing: 0 }}>
            {t('wallet.retirer.summary', { operator, phone: formatGnPhone(phone) })}
          </Text>
        )}
        <Button
          size="lg"
          block
          loading={withdraw.isPending}
          disabled={!canSubmit}
          label={amount > 0 ? t('wallet.retirer.ctaWithAmount', { amount: formatGNF(amount) }) : t('wallet.retirer.cta')}
          onPress={submit}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
