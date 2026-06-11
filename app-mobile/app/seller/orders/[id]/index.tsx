import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import {
  Truck,
  Receipt,
  ShieldCheck,
  PackageX,
} from 'lucide-react-native';
import { useEffect } from 'react';
import { useTheme } from '../../../../src/theme/ThemeProvider';
import { Text } from '../../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../../src/lib/haptics';
import { useOrder } from '../../../../src/data/queries';
import { formatGNF } from '../../../../src/lib/format';
import { OrderResolutionBanner } from '../../../../src/components/orders/OrderResolutionBanner';
import { useAuth } from '../../../../src/stores/auth';
import { useToast } from '../../../../src/components/feedback/Toast';

export default function SellerOrderDetailRoute() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading } = useOrder(id);
  const meId = useAuth((s) => s.user?.id ?? s.authUserId);
  const toast = useToast();

  // Phase T.2 — owner check. confirm.tsx already guards buyer-side ; this
  // mirror covers the seller side. Wrong owner → bounce to home with a
  // calm toast, not an authoritative-looking 403 screen ; the user reached
  // here via a stale link, not a hostile probe.
  const wrongOwner = !isLoading && !!order && !!meId && order.sellerId !== meId;
  useEffect(() => {
    if (wrongOwner) {
      toast.show("Cette commande ne fait pas partie de tes ventes.", 'info');
      router.replace('/(tabs)');
    }
  }, [wrongOwner, toast]);

  if (isLoading || wrongOwner) {
    return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  if (!order) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Commande" subtitle="Introuvable" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
          <PackageX size={28} color={colors.textFaint} strokeWidth={1.75} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
            Cette commande n'existe plus
          </Text>
          <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: 'center' }}>
            Elle a peut-être été annulée ou tu n'as pas accès à ce détail.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const needsShip = order.status === 'paid' || order.status === 'placed';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <ScreenHeader title="Commande" subtitle={order.reference} />

        <View style={{ paddingHorizontal: 24 }}>
          <OrderResolutionBanner order={order} viewerRole="seller" />
        </View>

        {/* Product */}
        <View style={{ paddingHorizontal: 24 }}>
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
            <Image
              source={order.productSnapshot.photo}
              style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: colors.bgSunken }}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: colors.text,
                  letterSpacing: 0,
                  lineHeight: 18,
                  includeFontPadding: false,
                }}
                numberOfLines={2}
              >
                {order.productSnapshot.title}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.text,
                  marginTop: 4,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatGNF(order.productSnapshot.priceGnf)} × {order.quantity}
              </Text>
            </View>
          </View>
        </View>

        {/* Money breakdown */}
        <Section title="Paiement">
          <View
            style={{
              padding: 14,
              borderRadius: 18,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 10,
            }}
          >
            {/* Ledger truth : the buyer pays the fee on top (total = amount +
                fees) ; on release the seller wallet is credited the FULL
                amount. The fee is never deducted from the seller. */}
            <BreakLine label="Montant article" value={formatGNF(order.amountGnf)} />
            <BreakLine label="Frais Linky (payés par l'acheteur)" value={formatGNF(order.feesGnf)} muted />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <BreakLine label="Tu recevras" value={formatGNF(order.amountGnf)} bold />
            <View
              style={{
                marginTop: 4,
                padding: 12,
                borderRadius: 12,
                backgroundColor: colors.primarySoft,
                flexDirection: 'row',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <ShieldCheck size={13} color={colors.primary} strokeWidth={2.25} style={{ marginTop: 1 }} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: colors.primaryDeep,
                  lineHeight: 17,
                  letterSpacing: 0,
                }}
              >
                Le paiement est en escrow. Tu recevras les fonds après confirmation de réception par l'acheteur.
              </Text>
            </View>
          </View>
        </Section>

        {/* Timeline events */}
        <Section title="Historique">
          <View
            style={{
              padding: 14,
              borderRadius: 18,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 12,
            }}
          >
            {order.events.map((e, idx) => (
              <View key={idx} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: idx === order.events.length - 1 ? colors.primary : colors.bgSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 1,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: idx === order.events.length - 1 ? '#FFFFFF' : colors.textMuted,
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13.5,
                      fontWeight: '600',
                      color: colors.text,
                      letterSpacing: 0,
                      lineHeight: 17,
                      includeFontPadding: false,
                    }}
                  >
                    {e.label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11.5,
                      color: colors.textMuted,
                      marginTop: 2,
                      letterSpacing: 0,
                    }}
                  >
                    {new Date(e.at).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>

      {/* Sticky CTA */}
      <SafeAreaView
        edges={['bottom']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 8,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        {needsShip ? (
          <Pressable
            onPress={() => {
              haptic.medium();
              router.push(`/seller/orders/${order.id}/ship`);
            }}
            style={{
              height: 56,
              borderRadius: 16,
              backgroundColor: colors.text,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Truck size={16} color={colors.bg} strokeWidth={2.25} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: colors.bg,
                lineHeight: 18,
                includeFontPadding: false,
              }}
            >
              Marquer comme expédiée
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => haptic.light()}
            style={{
              height: 56,
              borderRadius: 16,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Receipt size={16} color={colors.text} strokeWidth={2} />
            <Text
              style={{
                fontSize: 14.5,
                fontWeight: '700',
                color: colors.text,
                lineHeight: 17,
                includeFontPadding: false,
              }}
            >
              Voir le reçu
            </Text>
          </Pressable>
        )}
      </SafeAreaView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: colors.textFaint,
          letterSpacing: 0.6,
          marginBottom: 10,
          marginLeft: 4,
        }}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function BreakLine({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 13, color: colors.textMuted, letterSpacing: 0 }}>{label}</Text>
      <Text
        style={{
          fontSize: bold ? 15 : 13,
          fontWeight: bold ? '700' : '600',
          color: muted ? colors.textMuted : colors.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

