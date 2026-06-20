// PRE-PROD V1.1 BÊTA — needs adversarial review before public launch.
// See supabase/functions/wallet-send/index.ts for the open security questions
// (daily limits, KYC gating, recipient consent, reversal posture).
import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { Chip } from '../../src/components/primitives/Chip';
import { TopBar } from '../../src/components/nav/TopBar';
import { StickyBottom } from '../../src/components/nav/StickyBottom';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { Input } from '../../src/components/primitives/Input';
import { Skeleton } from '../../src/components/primitives/Skeleton';
import { ErrorStateView } from '../../src/components/feedback/EmptyState';
import { I } from '../../src/icons/Icon';
import { formatGNF } from '../../src/lib/format';
import { useToast } from '../../src/components/feedback/Toast';
import { useWallet } from '../../src/data/queries';
import { apiPost, toToastMessage } from '../../src/lib/api';
import { haptic } from '../../src/lib/haptics';
import { useMutation } from '@tanstack/react-query';
import { P2P_SEND_ENABLED } from '../../src/lib/flags';

const QUICK_AMOUNTS = [10_000, 50_000, 100_000, 500_000];
// Mirror the edge fn's MAX_SEND_MINOR so the input rejects out-of-band values
// before the network call. If the server cap changes, update both.
const MAX_SEND_MINOR = 1_000_000;
const MIN_SEND_MINOR = 1_000;

function normalizeGnPhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('224')) d = d.slice(3);
  return d.slice(0, 9);
}
function formatGnPhone(d: string): string {
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

function useSendMoney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { recipient_e164: string; amount_minor: number }) => {
      return apiPost<{ ok: true; ref_id: string; new_balance_minor: number | null }>({
        path: '/wallet-send',
        body: input,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

export default function EnvoyerRoute() {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const { show } = useToast();
  const walletQuery = useWallet();
  const send = useSendMoney();
  const balance = walletQuery.data?.balanceGnf ?? 0;

  // P2P send is gated OFF for shipped builds — see
  // WALLET_SEND_V1_1_BACKLOG.md. Redirect any deep-link / typed URL away
  // before the screen paints. Effect runs once on mount ; replace (not
  // push) so the back button doesn't bounce the user right back here.
  useEffect(() => {
    if (!P2P_SEND_ENABLED) {
      router.replace('/wallet');
    }
  }, []);
  if (!P2P_SEND_ENABLED) return null;

  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState(0);

  const phoneValid = phone.length === 9 && phone.startsWith('6');
  const aboveMin = amount >= MIN_SEND_MINOR;
  const belowMax = amount <= MAX_SEND_MINOR;
  const exceedsBalance = amount > balance;
  const canSubmit =
    phoneValid && aboveMin && belowMax && !exceedsBalance && !send.isPending;

  // ── Loading / Error ────────────────────────────────────────────────────
  if (walletQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('wallet.envoyer.topbar')} back />
        <View style={{ padding: 16, gap: 14 }}>
          <Skeleton height={96} radius={16} />
          <Skeleton height={120} radius={16} />
        </View>
      </SafeAreaView>
    );
  }
  if (walletQuery.isError) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('wallet.envoyer.topbar')} back />
        <ErrorStateView onRetry={() => void walletQuery.refetch()} />
      </SafeAreaView>
    );
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  function submit() {
    if (!canSubmit) return;
    haptic.medium();
    send.mutate(
      {
        recipient_e164: `+224${phone}`,
        amount_minor: amount,
      },
      {
        onSuccess: () => {
          show(t('wallet.envoyer.successToast'), 'success');
          if (router.canGoBack()) router.back();
          else router.replace('/wallet');
        },
        onError: (e) => show(toToastMessage(e, t('wallet.envoyer.errorToast')), 'danger'),
      },
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('wallet.envoyer.topbar')} back />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
      >
        {/* Bêta banner — required UX honesty while the V1.1 review is open. */}
        <View
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.accentSoft,
            backgroundColor: colors.accentSoft,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <I.shield size={14} color={colors.accentText} />
          <Text variant="caption" tone="muted" style={{ flex: 1, letterSpacing: 0, lineHeight: 17, color: colors.accentText }}>
            {t('wallet.envoyer.betaNote')}
          </Text>
        </View>

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
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <I.wallet size={18} color={colors.primary} />
          </View>
          <View>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
              {t('wallet.envoyer.balanceLabel')}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primaryDeep, fontVariant: ['tabular-nums'] }}>
              {formatGNF(balance)}
            </Text>
          </View>
        </View>

        {/* Recipient */}
        <MicroLabel label={t('wallet.envoyer.recipientLabel')} />
        <Input
          label={t('wallet.envoyer.phoneInputLabel')}
          leadingIcon="phone"
          keyboardType="phone-pad"
          placeholder={t('wallet.envoyer.phonePlaceholder')}
          value={formatGnPhone(phone)}
          onChangeText={(txt) => setPhone(normalizeGnPhone(txt))}
          errorText={
            phone.length > 0 && !phoneValid ? t('wallet.envoyer.phoneInvalid') : undefined
          }
          helperText={phone.length === 0 ? t('wallet.envoyer.phoneHint') : undefined}
        />

        {/* Amount */}
        <View style={{ marginTop: 22 }}>
          <MicroLabel label={t('wallet.envoyer.amountLabel')} />
          <View
            style={{
              backgroundColor: colors.bgElev,
              borderRadius: 16,
              paddingVertical: 22,
              paddingHorizontal: 20,
              borderWidth: 1,
              borderColor: exceedsBalance || (amount > 0 && !belowMax) ? colors.danger : colors.border,
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
              style={{
                fontSize: 36,
                fontWeight: '700',
                color: exceedsBalance || (amount > 0 && !belowMax) ? colors.danger : colors.text,
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
            {QUICK_AMOUNTS.filter((v) => v <= balance && v <= MAX_SEND_MINOR).map((v) => (
              <Chip
                key={v}
                label={new Intl.NumberFormat('fr-FR').format(v)}
                active={v === amount}
                onPress={() => setAmount(v)}
              />
            ))}
          </View>

          <Text
            variant="caption"
            tone="muted"
            style={{
              marginTop: 12,
              letterSpacing: 0,
              color: exceedsBalance || (amount > 0 && !belowMax) ? colors.danger : undefined,
            }}
          >
            {exceedsBalance
              ? t('wallet.envoyer.insufficient', { balance: formatGNF(balance) })
              : amount > 0 && !belowMax
                ? t('wallet.envoyer.aboveCap', { cap: formatGNF(MAX_SEND_MINOR) })
                : t('wallet.envoyer.cap', { cap: formatGNF(MAX_SEND_MINOR) })}
          </Text>
        </View>

        {/* Final reminder — sends are irreversible on a wallet rail. */}
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
          <I.info size={16} color={colors.textMuted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, letterSpacing: 0, lineHeight: 18 }}>
            {t('wallet.envoyer.irreversibleNote')}
          </Text>
        </View>
      </ScrollView>

      <StickyBottom>
        <Button
          size="lg"
          block
          loading={send.isPending}
          disabled={!canSubmit}
          label={
            amount > 0
              ? t('wallet.envoyer.ctaWithAmount', { amount: formatGNF(amount) })
              : t('wallet.envoyer.cta')
          }
          onPress={submit}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
