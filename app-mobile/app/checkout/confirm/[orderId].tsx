import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Card } from '../../../src/components/primitives/Card';
import { Button } from '../../../src/components/primitives/Button';
import { TopBar } from '../../../src/components/nav/TopBar';
import { formatGNF } from '../../../src/lib/format';
import { useToast } from '../../../src/components/feedback/Toast';
import { useOrderWithIntent } from '../../../src/data/queries/orders';
import { useCancelPendingPayment } from '../../../src/data/queries/payments';
import { useCart } from '../../../src/stores/cart';

const TTL_MS = 15 * 60 * 1000;

// P1 defensive: with the one-query design (useOrderWithIntent returns
// {order, intent} in a single payload), INVALID is structurally impossible
// during normal TanStack refetch. It's still possible during a sub-millisecond
// Postgres commit window between status updates - render a calm spinner rather
// than route away. If it persists > 10s (very unlikely), fall back to /checkout.
const INVALID_PERSISTENCE_TIMEOUT_MS = 10_000;

type StateClass = 'WAIT' | 'SUCCESS' | 'FAIL' | 'EXPIRED' | 'USER_CANCEL' | 'INVALID';
type TerminalState = 'FAIL' | 'EXPIRED' | 'USER_CANCEL';

// Phase I.9 — terminal-state copy keyed off i18n. Resolved at render via t()
// so the FAIL / EXPIRED / USER_CANCEL strings flip with language.
const TERMINAL_COPY_KEYS: Record<TerminalState, { titleKey: string; messageKey: string }> = {
  FAIL:        { titleKey: 'checkout.confirmTerminalFailTitle',       messageKey: 'checkout.confirmTerminalFailMessage' },
  EXPIRED:     { titleKey: 'checkout.confirmTerminalExpiredTitle',    messageKey: 'checkout.confirmTerminalExpiredMessage' },
  USER_CANCEL: { titleKey: 'checkout.confirmTerminalUserCancelTitle', messageKey: 'checkout.confirmTerminalUserCancelMessage' },
};

function classify(orderStatus: string, intentStatus?: string): StateClass {
  if (orderStatus === 'placed'    && intentStatus === 'pending')   return 'WAIT';
  if (orderStatus === 'paid'      && intentStatus === 'completed') return 'SUCCESS';
  if (orderStatus === 'cancelled' && intentStatus === 'failed')    return 'FAIL';
  if (orderStatus === 'cancelled' && intentStatus === 'expired')   return 'EXPIRED';
  if (orderStatus === 'cancelled' && intentStatus === 'cancelled') return 'USER_CANCEL';
  return 'INVALID';
}

function maskPhone(e164: string): string {
  // "+224622551288" -> "+224 622 •• 12 88"
  if (!e164.startsWith('+224') || e164.length !== 13) return e164;
  const local = e164.slice(4);
  return `+224 ${local.slice(0, 3)} •• ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

export default function CheckoutConfirmRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { show } = useToast();
  const { data, error, isLoading } = useOrderWithIntent(orderId);
  const cancel = useCancelPendingPayment();

  // Live countdown ticker (drives the mm:ss display only - no expiry trigger).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // S1 INVALID persistence tracker. Lives in effects, not render.
  const invalidSinceRef = useRef<number | null>(null);
  const [invalidExpired, setInvalidExpired] = useState(false);

  const order = data?.order;
  const intent = data?.intent ?? null;
  const stateClass: StateClass | null = order && intent ? classify(order.status, intent.status) : null;

  useEffect(() => {
    if (stateClass !== 'INVALID') {
      invalidSinceRef.current = null;
      setInvalidExpired(false);
      return;
    }
    if (invalidSinceRef.current === null) invalidSinceRef.current = Date.now();
    const elapsed = Date.now() - invalidSinceRef.current;
    if (elapsed >= INVALID_PERSISTENCE_TIMEOUT_MS) {
      setInvalidExpired(true);
      return;
    }
    const t = setTimeout(() => setInvalidExpired(true), INVALID_PERSISTENCE_TIMEOUT_MS - elapsed);
    return () => clearTimeout(t);
  }, [stateClass]);

  // S1: ALL router.replace calls live in effects.
  useEffect(() => {
    if (!data || !order) return;
    if (!intent) {
      // Wallet orders shouldn't reach this screen; defensively route to success.
      // Phase U.3 — clear here too as a safety net ; the wallet onSuccess in
      // checkout/index.tsx already cleared, but a hard refresh could land
      // a wallet-paid order on this screen with the cart still populated.
      useCart.getState().clear();
      router.replace(`/checkout/success?orderId=${order.id}`);
      return;
    }
    if (stateClass === 'SUCCESS') {
      // Phase U.3 — payment actually completed (order paid + intent
      // completed). Safe to clear the cart now ; any prior cancel /
      // failure left it intact so the buyer could retry without
      // re-finding the product.
      useCart.getState().clear();
      router.replace(`/checkout/success?orderId=${order.id}`);
      return;
    }
    if (stateClass === 'INVALID' && invalidExpired) {
      router.replace('/checkout');
    }
  }, [data, intent, stateClass, invalidExpired, order?.id]);

  // M2: error screen.
  if (error) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('checkout.confirmErrorTitle')} back />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text variant="dispL" center style={{ fontSize: 18 }}>{t('checkout.confirmNotFoundTitle')}</Text>
          <Text variant="bodyM" tone="muted" center style={{ marginTop: 8 }}>
            {t('checkout.confirmAccessTitle')}
          </Text>
          <Button
            variant="dark" size="lg" block
            style={{ marginTop: 24 }}
            label={t('checkout.confirmBackHome')}
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      </SafeAreaView>
    );
  }

  // M2 + S1: loading/syncing screen.
  //  - isLoading: TanStack first-fetch
  //  - !data || !order || !intent: pre-effect window (wallet order or intent missing)
  //  - SUCCESS: brief window before the redirect effect fires
  //  - INVALID && !invalidExpired: P1 defensive sync state
  if (isLoading || !data || !order || !intent || stateClass === 'SUCCESS' ||
      (stateClass === 'INVALID' && !invalidExpired)) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('checkout.confirmTrackingTitle')} subtitle={order?.reference ? `#${order.reference}` : undefined} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="bodyM" tone="muted">{t('checkout.confirmSyncing')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Past this point: stateClass is WAIT | FAIL | EXPIRED | USER_CANCEL.
  // (INVALID-expired routed away via the effect above.)

  // Phase Q — card orders confirm via the Stripe webhook (1-3s typical), not
  // a buyer action on their phone : different WAIT copy, no phone row, no
  // 15-min countdown (stripe intents are excluded from the TTL sweep).
  const isCard = order.paymentMethod === 'card';

  // Countdown for WAIT state.
  const elapsedMs = now - new Date(intent.createdAt).getTime();
  const remainingMs = Math.max(0, TTL_MS - elapsedMs);
  const mm = String(Math.floor(remainingMs / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0');
  const cardSlow = isCard && elapsedMs > 30_000;

  async function handleCancel() {
    try {
      await cancel.mutateAsync({ orderId: order!.id });
      show(t('checkout.confirmCancelled'), 'info');
      router.replace('/(tabs)');
    } catch (e: unknown) {
      const err = e as { code?: string; message_fr?: string };
      if (err.code === 'PAYMENT_ALREADY_COMPLETED') {
        // The cancel raced the payment and the payment won — that's a success,
        // not an error. Stay here ; polling flips the screen to SUCCESS.
        show(err.message_fr ?? t('checkout.confirmPaidJustNow'), 'info');
        return;
      }
      show(t('checkout.confirmCancelError'), 'danger');
    }
  }

  // Phone-edit flow removed with the Lengopay hosted-page migration (the number
  // is entered on Lengopay's page now — an in-app edit was inert + destructive).

  // ─────────────────────────────────────────────────────────────────────────
  // WAIT state
  // ─────────────────────────────────────────────────────────────────────────
  if (stateClass === 'WAIT') {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('checkout.confirmTrackingTitle')} back subtitle={`#${order.reference}`} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <Card padding={16} style={{ marginTop: 12 }}>
            <Row label={t('checkout.confirmRowMethod')} value={isCard ? t('checkout.card') : order.paymentMethod === 'orange-money' ? t('checkout.rails.orangeMoney') : t('checkout.rails.mtnMoney')} />
            {/* Mobile-money is the Lengopay HOSTED-PAGE rail now: the buyer
                enters + confirms their number ON Lengopay's page, so an in-app
                « Modifier le numéro » is inert and only triggers a destructive
                cancel+re-place (review 2026-07-07). The edit affordance is
                removed; the number stays as read-only context. */}
            {!isCard && intent.payerPhone && (
              <Row
                label={t('checkout.confirmRowNumber')}
                value={maskPhone(intent.payerPhone)}
              />
            )}
            <Row label={t('checkout.confirmRowAmount')} value={formatGNF(order.totalGnf)} />
          </Card>

          {isCard ? (
            <Card padding={16} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
                {t('checkout.confirmCardConfirmingTitle')}
              </Text>
              <Text variant="bodyM" tone="muted" style={{ textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
                {t('checkout.confirmCardConfirmingBodyPlain', { amount: formatGNF(order.totalGnf) })}
              </Text>
              {cardSlow && (
                <Text variant="bodyM" tone="muted" style={{ textAlign: 'center', marginTop: 12, lineHeight: 19 }}>
                  {t('checkout.confirmTakingLonger')}
                </Text>
              )}
            </Card>
          ) : (
          <Card padding={16} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
              {t('checkout.confirmCheckPhoneTitle')}
            </Text>
            <Text variant="bodyM" tone="muted" style={{ textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
              {t('checkout.confirmCheckPhoneBody', { amount: formatGNF(order.totalGnf) })}
            </Text>
            {/* Lengopay hosted page — the buyer approves the payment there.
                Reconstructed from the pay_id (railIntentId) so it survives a
                screen reload; hidden while the placeholder id is in place. */}
            {!intent.railIntentId.startsWith('pending-init-') && (
              <Button
                size="md"
                block
                style={{ marginTop: 14 }}
                label={t('checkout.confirmOpenPayment')}
                onPress={() => {
                  void Linking.openURL(`https://payment.lengopay.com/${intent.railIntentId}`).catch(() => undefined);
                }}
              />
            )}
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 16, fontVariant: ['tabular-nums'] }}>
              {t('checkout.confirmTimeRemaining', { time: `${mm}:${ss}` })}
            </Text>
          </Card>
          )}

          <Button
            variant="ghost"
            size="sm"
            block
            style={{ marginTop: 18 }}
            label={cancel.isPending ? t('checkout.confirmCancelling') : t('checkout.confirmCancelPayment')}
            onPress={handleCancel}
            disabled={cancel.isPending}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Terminal states (FAIL / EXPIRED / USER_CANCEL)
  // ─────────────────────────────────────────────────────────────────────────
  const copyKeys = TERMINAL_COPY_KEYS[stateClass as TerminalState];
  const copyTitle = t(copyKeys.titleKey);
  const copyMessage = t(copyKeys.messageKey);
  const failMessage = stateClass === 'FAIL' && intent.lastErrorMessage ? intent.lastErrorMessage : copyMessage;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('checkout.confirmTrackingTitle')} back subtitle={`#${order.reference}`} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <Card padding={20} style={{ marginTop: 18, backgroundColor: 'rgba(209,79,60,0.06)', borderColor: 'rgba(209,79,60,0.2)' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.danger }}>
            {t('checkout.confirmTerminalErrorPrefix', { title: copyTitle })}
          </Text>
          <Text variant="bodyM" tone="muted" style={{ marginTop: 8, lineHeight: 19 }}>
            {failMessage}
          </Text>
        </Card>
        <Button
          variant="dark"
          size="lg"
          block
          style={{ marginTop: 18 }}
          label={t('checkout.confirmRetry')}
          onPress={() => router.replace('/checkout')}
        />
        <Button
          variant="ghost"
          size="sm"
          block
          style={{ marginTop: 8 }}
          label={t('checkout.confirmContinueShopping')}
          onPress={() => router.replace('/(tabs)')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, right }: { label: string; value: string; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}>
      <Text variant="bodyM" tone="muted" style={{ flex: 1 }}>{label}</Text>
      {value && <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] }}>{value}</Text>}
      {right}
    </View>
  );
}
