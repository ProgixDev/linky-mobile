// Card-funded wallet top-up. Mobile Money (Orange/MTN) recharge stays blocked
// on the Lengopay contract, so card is the one wet funding rail: amount entry
// -> wallet-topup-card (Stripe PaymentIntent) -> PaymentSheet -> the
// stripe-webhook credits the wallet via confirm_topup a couple seconds later.
import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStripe, PaymentSheetError } from '@stripe/stripe-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, Smartphone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { Chip } from '../../src/components/primitives/Chip';
import { TopBar } from '../../src/components/nav/TopBar';
import { StickyBottom } from '../../src/components/nav/StickyBottom';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { formatGNF } from '../../src/lib/format';
import { useToast } from '../../src/components/feedback/Toast';
import { useTopupCard, useWallet } from '../../src/data/queries';
import { toToastMessage } from '../../src/lib/api';
import { haptic } from '../../src/lib/haptics';
import { WALLET_TOPUP_ENABLED } from '../../src/lib/flags';

const MIN_TOPUP = 10_000;
const QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000];
const STRIPE_TEST_MODE = (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_test_');

export default function RechargerRoute() {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const { show } = useToast();
  const qc = useQueryClient();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const topup = useTopupCard();
  const walletQuery = useWallet();
  const balance = walletQuery.data?.balanceGnf ?? 0;

  const [amount, setAmount] = useState(100_000);
  const [busy, setBusy] = useState(false);

  // Top-up removed (wallet restructure) : a rechargeable spendable balance is
  // e-money under Guinean law (BCRG agrément required). Redirect deep-links /
  // old entry points away before the screen paints. replace, not push, so back
  // doesn't bounce here.
  useEffect(() => {
    if (!WALLET_TOPUP_ENABLED) {
      router.replace('/wallet');
    }
  }, []);

  const tooLow = amount < MIN_TOPUP;
  const canPay = !tooLow && !busy && !topup.isPending;

  // All hooks above run unconditionally (rules-of-hooks) ; bail after them.
  if (!WALLET_TOPUP_ENABLED) return null;

  async function pay() {
    if (!canPay) return;
    haptic.medium();
    setBusy(true);
    try {
      const { client_secret } = await topup.mutateAsync(amount);
      const { error: initErr } = await initPaymentSheet({
        merchantDisplayName: 'Linky',
        paymentIntentClientSecret: client_secret,
        googlePay: { merchantCountryCode: 'US', testEnv: STRIPE_TEST_MODE },
        returnURL: 'linky://stripe-redirect',
      });
      if (initErr) {
        show(t('wallet.recharger.prepareError'), 'danger');
        return;
      }
      const { error: payErr } = await presentPaymentSheet();
      if (payErr) {
        if (payErr.code !== PaymentSheetError.Canceled) show(payErr.message || t('wallet.recharger.payError'), 'danger');
        return;
      }
      // Charge succeeded. The webhook credits the wallet in ~1-3s ; invalidate
      // now and let the wallet screen's refetch-on-focus pick up the new balance.
      show(t('wallet.recharger.successToast'), 'success');
      qc.invalidateQueries({ queryKey: ['wallet'] });
      if (router.canGoBack()) router.back();
      else router.replace('/wallet');
    } catch (e) {
      show(toToastMessage(e, t('wallet.recharger.errorToast')), 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('wallet.recharger.topbar')} back />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
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
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard size={18} color={colors.primary} />
          </View>
          <View>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
              {t('wallet.recharger.balanceLabel')}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primaryDeep, fontVariant: ['tabular-nums'] }}>
              {formatGNF(balance)}
            </Text>
          </View>
        </View>

        {/* Amount */}
        <MicroLabel label={t('wallet.recharger.amountLabel')} />
        <View
          style={{
            backgroundColor: colors.bgElev,
            borderRadius: 16,
            paddingVertical: 22,
            paddingHorizontal: 20,
            borderWidth: 1,
            borderColor: tooLow ? colors.danger : colors.border,
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
            accessibilityLabel={t('wallet.recharger.accessAmount')}
            style={{
              fontSize: 36,
              fontWeight: '700',
              color: tooLow ? colors.danger : colors.text,
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
          {QUICK_AMOUNTS.map((v) => (
            <Chip key={v} label={new Intl.NumberFormat('fr-FR').format(v)} active={v === amount} onPress={() => setAmount(v)} />
          ))}
        </View>

        <Text variant="caption" tone="muted" style={{ marginTop: 12, letterSpacing: 0, color: tooLow ? colors.danger : undefined }}>
          {tooLow ? t('wallet.recharger.minimum', { amount: formatGNF(MIN_TOPUP) }) : t('wallet.recharger.securityNote')}
        </Text>

        {/* Mobile Money — honest "coming" note */}
        <View
          style={{
            marginTop: 22,
            flexDirection: 'row',
            gap: 12,
            padding: 14,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            alignItems: 'center',
          }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
            <Smartphone size={18} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600' }}>{t('wallet.recharger.mmTitle')}</Text>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', marginTop: 2 }}>
              {t('wallet.recharger.mmSub')}
            </Text>
          </View>
        </View>
      </ScrollView>

      <StickyBottom>
        <Button
          size="lg"
          block
          loading={busy || topup.isPending}
          disabled={!canPay}
          leading={<CreditCard size={16} color={colors.bg} strokeWidth={2.25} />}
          label={t('wallet.recharger.payCta', { amount: formatGNF(amount) })}
          onPress={pay}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
