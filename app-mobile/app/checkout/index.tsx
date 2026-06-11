import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStripe, PaymentSheetError } from '@stripe/stripe-react-native';
import { useQueries } from '@tanstack/react-query';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Card } from '../../src/components/primitives/Card';
import { Button } from '../../src/components/primitives/Button';
import { TopBar } from '../../src/components/nav/TopBar';
import { StickyBottom } from '../../src/components/nav/StickyBottom';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { I, type IconKey } from '../../src/icons/Icon';
import { formatGNF } from '../../src/lib/format';
import { useCart } from '../../src/stores/cart';
import { apiPost } from '../../src/lib/api';
import { usePlaceOrder, useWallet } from '../../src/data/queries';
import type { PaymentMethod, Product } from '../../src/data/types';
import { useToast } from '../../src/components/feedback/Toast';

interface MethodOption {
  id: PaymentMethod;
  name: string;
  hint: string;
  badge: string;
  badgeColor: string;
  iconKey?: IconKey;
}

// Google Pay test mode must follow the KEY, not a hardcoded flag — otherwise
// the prod key swap would silently leave Google Pay in test mode.
const STRIPE_TEST_MODE = (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_test_');

const METHODS: MethodOption[] = [
  { id: 'orange-money', name: 'Orange Money', hint: 'Tu confirmes au prochain écran', badge: 'OM', badgeColor: '#FF7900' },
  { id: 'mtn-money', name: 'MTN Mobile Money', hint: 'Tu confirmes au prochain écran', badge: 'M', badgeColor: '#FFC500' },
];

export default function CheckoutRoute() {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<PaymentMethod>('orange-money');
  const lines = useCart((s) => s.lines);
  const placeOrder = usePlaceOrder();
  const { show } = useToast();
  const walletQuery = useWallet();
  const wallet = walletQuery.data;
  // Phase U.0d — most decision-sensitive money surface on the app ; the
  // bare wallet?.balanceGnf ?? 0 read 0 GNF confidently while the query
  // was still loading or had errored, framing a wallet payment as
  // impossible.
  const walletReady = !walletQuery.isLoading && !walletQuery.isError && !!wallet;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  // Keeps the Payer button busy across the whole sheet flow (place-order →
  // init → present), not just the mutation.
  const [cardFlowBusy, setCardFlowBusy] = useState(false);

  // Phase Q — card checkout via the Stripe payment sheet. Whatever happens
  // after place-order succeeds (sheet success, sheet cancel, init failure),
  // the confirmation screen is the destination : it polls get-order and shows
  // the same pending / paid / cancelled states as the Lengopay rail.
  async function handleCardOrder() {
    const first = lines[0];
    if (!first) return;
    setCardFlowBusy(true);
    try {
      const { order, payment } = await placeOrder.mutateAsync({
        productId: first.productId,
        quantity: first.quantity,
        paymentMethod: 'card',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-router typed-routes regenerate on next `expo start`; route exists on disk.
      const confirmRoute = `/checkout/confirm/${order.id}` as any;
      if (!payment) {
        router.replace(confirmRoute);
        return;
      }
      const { error: initErr } = await initPaymentSheet({
        merchantDisplayName: 'Linky',
        paymentIntentClientSecret: payment.client_secret,
        googlePay: { merchantCountryCode: 'US', testEnv: STRIPE_TEST_MODE },
        returnURL: 'linky://stripe-redirect',
      });
      if (initErr) {
        show('Impossible de préparer le paiement', 'danger');
        router.replace(confirmRoute);
        return;
      }
      const { error: payErr } = await presentPaymentSheet();
      if (payErr && payErr.code !== PaymentSheetError.Canceled) {
        show(payErr.message || 'Paiement échoué', 'danger');
      }
      // Success : webhook flips the order to paid in ~1-3s, the confirmation
      // screen polls until then. Cancel : order stays placed + intent pending,
      // same screen offers « Annuler le paiement ».
      router.replace(confirmRoute);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Erreur paiement';
      show(msg, 'danger');
    } finally {
      setCardFlowBusy(false);
    }
  }

  // Real backend prices, same queryKey as useProduct → shared cache with the
  // detail page and cart screen. Subtotal stays at 0 until products land,
  // and the Payer button is gated on allLoaded so we don't ship a wrong total.
  const queries = useQueries({
    queries: lines.map((l) => ({
      queryKey: ['product', l.productId],
      queryFn: async (): Promise<Product> => {
        const { product } = await apiPost<{ product: Product }>({
          path: '/get-product', authed: false, body: { id: l.productId },
        });
        return product;
      },
      retry: 1,
    })),
  });
  const allLoaded = queries.every((q) => !q.isLoading);
  const subtotal = lines.reduce((sum, l, i) => {
    const p = queries[i].data;
    return sum + (p?.priceGnf ?? 0) * l.quantity;
  }, 0);
  const total = subtotal + Math.round(subtotal * 0.03);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Moyen de paiement" back />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <MicroLabel label="Mobile Money" />
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: 16 }}>
          {METHODS.map((m, i) => {
            const sel = selected === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => setSelected(m.id)}
                style={{
                  padding: 14,
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  borderBottomWidth: i < METHODS.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: m.badgeColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>{m.badge}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600' }}>{m.name}</Text>
                  <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', fontVariant: ['tabular-nums'] }}>
                    {m.hint}
                  </Text>
                </View>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: sel ? colors.primary : 'transparent',
                    borderWidth: sel ? 0 : 1.5,
                    borderColor: colors.borderStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {sel && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
                </View>
              </Pressable>
            );
          })}
        </Card>

        <MicroLabel label="Autres options" />
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: 16 }}>
          <Pressable
            onPress={() => setSelected('wallet')}
            style={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <I.wallet size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600' }}>Wallet Linky</Text>
              <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', fontVariant: ['tabular-nums'] }}>
                Solde {walletReady ? formatGNF(wallet!.balanceGnf) : '—'}
              </Text>
            </View>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                backgroundColor: selected === 'wallet' ? colors.primary : 'transparent',
                borderWidth: selected === 'wallet' ? 0 : 1.5,
                borderColor: colors.borderStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {selected === 'wallet' && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
            </View>
          </Pressable>
          <Pressable
            onPress={() => setSelected('card')}
            style={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: '#635BFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <I.card size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600' }}>Carte bancaire</Text>
              <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', fontVariant: ['tabular-nums'] }}>
                Visa, Mastercard, Google Pay
              </Text>
            </View>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                backgroundColor: selected === 'card' ? colors.primary : 'transparent',
                borderWidth: selected === 'card' ? 0 : 1.5,
                borderColor: colors.borderStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {selected === 'card' && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
            </View>
          </Pressable>
        </Card>

        <Card padding={12}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <I.info size={16} color={colors.primary} />
            <Text variant="micro" tone="muted" style={{ flex: 1, lineHeight: 16, letterSpacing: 0, textTransform: 'none' }}>
              {selected === 'card' ? (
                <>Tu confirmes le paiement dans une{' '}
                <Text style={{ color: colors.text, fontWeight: '700' }}>fenêtre sécurisée</Text> — carte ou Google Pay.</>
              ) : (
                <>Tu recevras un{' '}
                <Text style={{ color: colors.text, fontWeight: '700' }}>code SMS</Text> sur ton numéro {selected === 'mtn-money' ? 'MTN' : 'Orange Money'} pour confirmer le paiement.</>
              )}
            </Text>
          </View>
        </Card>
      </ScrollView>

      <StickyBottom>
        <Button
          size="lg"
          block
          loading={placeOrder.isPending || cardFlowBusy}
          disabled={placeOrder.isPending || cardFlowBusy || !allLoaded || lines.length === 0}
          label={placeOrder.isPending || cardFlowBusy ? 'Paiement en cours…' : `Payer ${formatGNF(total)}`}
          onPress={() => {
            const first = lines[0];
            if (!first) return;
            if (selected === 'card') {
              void handleCardOrder();
              return;
            }
            placeOrder.mutate(
              { productId: first.productId, quantity: first.quantity, paymentMethod: selected },
              {
                onSuccess: ({ order, intent }) => {
                  if (intent) {
                    // Rail path: route to confirmation screen with spinner + cron polling.
                    // Phase U.3 — DO NOT clear cart yet ; the rail can still
                    // fail or be cancelled. Clear lives in the SUCCESS branch
                    // of confirm/[orderId].tsx.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-router typed-routes regenerate on next `expo start`; route exists on disk.
                    router.replace(`/checkout/confirm/${order.id}` as any);
                  } else {
                    // Wallet path (no intent): order already at status='paid'.
                    // Phase U.3 — wallet payment is instant + non-cancellable
                    // from the buyer side, so this is the actual moment of
                    // payment success → safe to clear.
                    useCart.getState().clear();
                    show('Commande créée', 'success');
                    router.replace(`/checkout/success?orderId=${order.id}`);
                  }
                },
                onError: (err: unknown) => {
                  const msg = (err as { message?: string })?.message ?? 'Erreur paiement';
                  show(msg, 'danger');
                },
              },
            );
          }}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
