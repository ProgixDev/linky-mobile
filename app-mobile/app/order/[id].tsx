import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
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

// Phase I.9 — stage display label resolved via i18n at render. The
// eventLabel matchers (used to find the row in order.events) stay FR-only
// because they're stable backend strings the server writes ; matching by
// translated UI label would break the moment a non-FR client opens a
// previously-paid order.
const STAGE_DEFS: Array<{
  key: string;
  labelKey: string;
  // either of these matches an event row :
  eventKind?: string;
  eventLabel?: string;
}> = [
  { key: 'placed',    labelKey: 'order.stagePlaced',    eventLabel: 'Commande passée' },
  { key: 'paid',      labelKey: 'order.stagePaid',      eventLabel: 'Paiement reçu en séquestre' },
  { key: 'preparing', labelKey: 'order.stagePreparing', eventKind: 'shipped' },
  { key: 'released',  labelKey: 'order.stageReleased',  eventLabel: 'Réception confirmée' },
];

export default function OrderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const meId = useAuth((s) => s.user?.id ?? s.authUserId);
  const STAGES = useMemo(
    () => STAGE_DEFS.map((s) => ({ ...s, label: t(s.labelKey) })),
    [t],
  );

  if (isLoading || isError || !order) {
    return <DetailStateScreen loading={isLoading} title={t('order.fallbackTitle')} onRetry={() => void refetch()} />;
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
  // QR payload includes the scan_token secret as a query param. Phase LIVREUR
  // widened the get-order PII gate so BOTH buyer and seller receive scanToken
  // — the buyer renders the QR on-screen for the LIVREUR to scan at handoff
  // (the inverted flow), the seller still gets it for the legacy printed-QR
  // path. Non-participants never reach this screen (FORBIDDEN server-side).
  const qrPayload = order.scanToken
    ? `linky://order/${order.id}/confirm?token=${order.scanToken}`
    : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('order.trackingTitle')} back subtitle={`#${order.reference}`} />
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
                {t('order.qty', { count: order.quantity })}
              </Text>
            </View>
            <Text style={{ fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] }}>
              {formatGNF(order.productSnapshot.priceGnf)}
            </Text>
          </View>
        </Card>

        <View style={{ marginTop: 18 }}>
          <MicroLabel label={t('order.stageStatus')} />
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
                      {s.label}
                    </Text>
                    <Text variant="micro" tone="muted" style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}>
                      {stageEvent
                        ? new Date(stageEvent.at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : action
                          ? t('order.stageActionRequired')
                          : ''}
                    </Text>
                    {stageEvent?.tracking && (
                      <Text
                        variant="micro"
                        tone="muted"
                        style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}
                      >
                        {t('order.stageTracking', { tracking: stageEvent.tracking, carrier: stageEvent.carrier ? t('order.stageCarrierSuffix', { carrier: stageEvent.carrier }) : '' })}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
        </View>

        {isBuyer && inHandoffWindow && qrPayload && (
          <>
            <View style={{ marginTop: 18 }}>
              <MicroLabel label={t('order.buyerQrLabel')} />
              <Card padding={20}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <I.qr size={16} color={colors.text} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                    {t('order.buyerQrTitle')}
                  </Text>
                </View>
                {/* Phase LIVREUR — primary handoff path : the buyer's on-screen
                    QR is what the livreur scans with the Linky Driver app to
                    confirm delivery + release escrow. Same QRCode component
                    the seller uses on the legacy printed-QR side, just with
                    the buyer's now-permitted scanToken. */}
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
                  {t('order.buyerQrBody')}
                </Text>
              </Card>
            </View>

            {/* Secondary fallback : hand-carry / no-livreur orders still
                use the buyer-self-scan path (seller prints QR on package,
                buyer scans here). Both confirms are mutually exclusive
                via the order status gate — whichever fires first wins. */}
            <View style={{ marginTop: 14 }}>
              <Button
                variant="outline"
                block
                label={t('order.scanPackageQrCta')}
                leading={<I.qr size={16} color={colors.text} />}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- /scan typedRoute regenerates next start
                onPress={() => router.push('/scan' as any)}
              />
              <Button
                variant="ghost"
                size="sm"
                block
                style={{ marginTop: 8 }}
                label={t('order.reportProblem')}
                leading={<I.warn size={14} color={colors.danger} />}
                onPress={() => router.push(`/dispute/${order.id}`)}
              />
            </View>
          </>
        )}

        {isSeller && inHandoffWindow && qrPayload && (
          <View style={{ marginTop: 18 }}>
            <MicroLabel label={t('order.deliveryCodeLabel')} />
            <Card padding={20}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <I.qr size={16} color={colors.text} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                  {t('order.receiveCodeTitle')}
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
                {t('order.receiveCodeBody')}
              </Text>
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
