import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Card } from '../../src/components/primitives/Card';
import { Button } from '../../src/components/primitives/Button';
import { TopBar } from '../../src/components/nav/TopBar';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { I } from '../../src/icons/Icon';
import { formatGNF } from '../../src/lib/format';
import { useOrder } from '../../src/data/queries';
import { useAuth } from '../../src/stores/auth';
import { OrderResolutionBanner } from '../../src/components/orders/OrderResolutionBanner';
import { DetailStateScreen } from '../../src/components/feedback/DetailState';

// Each stage carries both its visible label (`t`) and the identity of the
// `orders.events` row that marks it as reached (`eventKind` or `eventLabel`).
// Pre-X9 we tried to match events by visible label, but the X.6b shipped event
// uses label 'Commande expédiée' (matching the buyer push) while this UI's
// 'preparing' row reads 'En cours de remise' — the labels never lined up so
// the shipped timestamp + tracking number never rendered under the stage. Now
// the stage matches events by identity (kind or label) instead.
const STAGES: Array<{
  key: string;
  t: string;
  // either of these matches an event row :
  eventKind?: string;
  eventLabel?: string;
}> = [
  { key: 'placed', t: 'Commande passée', eventLabel: 'Commande passée' },
  { key: 'paid', t: 'Paiement reçu en séquestre', eventLabel: 'Paiement reçu en séquestre' },
  { key: 'preparing', t: 'En cours de remise', eventKind: 'shipped' },
  { key: 'released', t: 'Réception confirmée', eventLabel: 'Réception confirmée' },
];

export default function OrderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const meId = useAuth((s) => s.user?.id ?? s.authUserId);

  if (isLoading || isError || !order) {
    return <DetailStateScreen loading={isLoading} title="Commande" onRetry={() => void refetch()} />;
  }

  const currentStageIdx = STAGES.findIndex((s) => s.key === order.status);
  const idx = currentStageIdx === -1 ? 2 : currentStageIdx;

  const isBuyer = !!meId && meId === order.buyerId;
  const isSeller = !!meId && meId === order.sellerId;
  // Phase X.9 — 'preparing' added. set-order-tracking (X.6b) flips paid orders
  // to 'preparing' the moment the seller marks them shipped ; without this
  // widening the buyer's scan CTA and the seller's QR card both vanish the
  // instant the package leaves, which is exactly when both surfaces matter
  // most. confirm_order_receipt + dispute_order accept 'preparing' too post-X9.
  const inHandoffWindow =
    order.status === 'paid' || order.status === 'preparing' || order.status === 'delivered';
  // QR payload includes the scan_token secret as a query param. Only the seller
  // receives scanToken in the get-order response (PII gate, server-side), so
  // this branch only renders when the seller is viewing their own order.
  // Buyer-side will never have access to scanToken — the QR is therefore only
  // visible to the seller, and the scan is the only way for the buyer to learn
  // the token. That's what makes the QR an actual lock, not a navigation hint.
  const qrPayload = order.scanToken
    ? `linky://order/${order.id}/confirm?token=${order.scanToken}`
    : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Suivi de commande" back subtitle={`#${order.reference}`} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {(isBuyer || isSeller) && (
          <OrderResolutionBanner
            order={order}
            viewerRole={isBuyer ? 'buyer' : 'seller'}
          />
        )}
        <Card padding={12}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Image
              source={order.productSnapshot.photo}
              style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.bgSunken }}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={2}>
                {order.productSnapshot.title}
              </Text>
              <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                Qté {order.quantity}
              </Text>
            </View>
            <Text style={{ fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] }}>
              {formatGNF(order.productSnapshot.priceGnf)}
            </Text>
          </View>
        </Card>

        <View style={{ marginTop: 18 }}>
          <MicroLabel label="Statut du séquestre" />
          <Card padding={16}>
            {STAGES.map((s, i, arr) => {
              const done = i < idx;
              const current = i === idx;
              const action = i === arr.length - 1 && !done && !current;
              // Match by event identity (kind/label), not by array index — events
              // can arrive out of expected order or skip stages (place→pay→ship
              // can fold to a single batch on offline replays).
              const stageEvent = order.events.find(
                (ev) =>
                  (s.eventKind && (ev as { kind?: string }).kind === s.eventKind) ||
                  (s.eventLabel && ev.label === s.eventLabel),
              ) as { at: string; label?: string; tracking?: string; carrier?: string } | undefined;
              return (
                <View key={s.key} style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        backgroundColor: done || current ? colors.primary : action ? colors.accent : colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: current ? colors.primary : 'transparent',
                        shadowOpacity: current ? 0.3 : 0,
                        shadowRadius: 0,
                      }}
                    >
                      {(done || current) && <I.check size={12} color="#FFFFFF" stroke={3} />}
                    </View>
                    {i < arr.length - 1 && (
                      <View style={{ width: 2, flex: 1, backgroundColor: i < idx ? colors.primary : colors.border, marginTop: 2, minHeight: 30 }} />
                    )}
                  </View>
                  <View style={{ flex: 1, paddingBottom: i < arr.length - 1 ? 22 : 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: done || current || action ? colors.text : colors.textMuted }}>
                      {s.t}
                    </Text>
                    <Text variant="micro" tone="muted" style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}>
                      {stageEvent
                        ? new Date(stageEvent.at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : action
                          ? 'Action requise dès remise'
                          : ''}
                    </Text>
                    {stageEvent?.tracking && (
                      <Text
                        variant="micro"
                        tone="muted"
                        style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}
                      >
                        Suivi · {stageEvent.tracking}
                        {stageEvent.carrier ? ` · ${stageEvent.carrier}` : ''}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
        </View>

        {isBuyer && inHandoffWindow && (
          <>
            <View style={{ marginTop: 18 }}>
              <MicroLabel label="Confirmation" />
              <Card padding={20}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <I.qr size={16} color={colors.text} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                    Scanne le QR du colis
                  </Text>
                </View>
                <Text style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 18 }}>
                  Pour libérer le paiement vers le vendeur, scanne le QR code collé sur ton colis avec l&apos;app. Cela garantit que tu as bien reçu ta commande — le code prouve la remise physique.
                </Text>
              </Card>
            </View>

            <View style={{ marginTop: 14 }}>
              <Button
                variant="primary"
                block
                label="Scanner le QR"
                leading={<I.qr size={16} color="#FFFFFF" />}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- /scan typedRoute regenerates next start
                onPress={() => router.push('/scan' as any)}
              />
              <Button
                variant="ghost"
                size="sm"
                block
                style={{ marginTop: 8 }}
                label="Signaler un problème"
                leading={<I.warn size={14} color={colors.danger} />}
                onPress={() => router.push(`/dispute/${order.id}`)}
              />
            </View>
          </>
        )}

        {isSeller && inHandoffWindow && qrPayload && (
          <View style={{ marginTop: 18 }}>
            <MicroLabel label="Code de livraison" />
            <Card padding={20}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <I.qr size={16} color={colors.text} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                  Code de réception
                </Text>
              </View>
              <View
                style={{
                  alignSelf: 'center',
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <QRCode value={qrPayload} size={180} backgroundColor="#FFFFFF" color="#0E1311" />
              </View>
              <Text
                variant="micro"
                tone="muted"
                style={{ alignSelf: 'center', marginTop: 10, letterSpacing: 0, textTransform: 'none' }}
              >
                #{order.reference}
              </Text>
              <Text
                style={{
                  marginTop: 14,
                  fontSize: 12.5,
                  color: colors.textMuted,
                  lineHeight: 18,
                  textAlign: 'center',
                }}
              >
                Imprime ce code et colle-le sur le colis. L&apos;acheteur le scanne à la réception
                pour confirmer et libérer ton paiement.
              </Text>
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
