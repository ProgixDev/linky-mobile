import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
import { getProduct } from '../../src/data/mockProducts';
import { usePlaceOrder } from '../../src/data/queries';
import type { PaymentMethod } from '../../src/data/types';
import { useToast } from '../../src/components/feedback/Toast';

interface MethodOption {
  id: PaymentMethod;
  name: string;
  hint: string;
  badge: string;
  badgeColor: string;
  iconKey?: IconKey;
}

const METHODS: MethodOption[] = [
  { id: 'orange-money', name: 'Orange Money', hint: '+224 622 •• 12 88', badge: 'OM', badgeColor: '#FF7900' },
  { id: 'mtn-money', name: 'MTN Mobile Money', hint: '+224 657 •• 44 02', badge: 'M', badgeColor: '#FFC500' },
];

export default function CheckoutRoute() {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<PaymentMethod>('orange-money');
  const lines = useCart((s) => s.lines);
  const placeOrder = usePlaceOrder();
  const { show } = useToast();

  const subtotal = lines.reduce((sum, l) => {
    const p = getProduct(l.productId);
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
            onPress={() => setSelected('card')}
            style={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
              <I.card size={18} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600' }}>Carte bancaire</Text>
              <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                Visa, Mastercard via Stripe
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
                Solde 850 000 GNF
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
        </Card>

        <Card padding={12}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <I.info size={16} color={colors.primary} />
            <Text variant="micro" tone="muted" style={{ flex: 1, lineHeight: 16, letterSpacing: 0, textTransform: 'none' }}>
              Tu recevras un{' '}
              <Text style={{ color: colors.text, fontWeight: '700' }}>code SMS</Text> sur ton numéro {selected === 'mtn-money' ? 'MTN' : 'Orange Money'} pour confirmer le paiement.
            </Text>
          </View>
        </Card>
      </ScrollView>

      <StickyBottom>
        <Button
          size="lg"
          block
          loading={placeOrder.isPending}
          disabled={placeOrder.isPending}
          label={placeOrder.isPending ? 'Paiement en cours…' : `Payer ${formatGNF(total)}`}
          onPress={() => {
            const first = lines[0];
            if (!first) return;
            placeOrder.mutate(
              { productId: first.productId, quantity: first.quantity, paymentMethod: selected },
              {
                onSuccess: (order) => {
                  show('Commande créée', 'success');
                  router.replace(`/checkout/success?orderId=${order.id}`);
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
