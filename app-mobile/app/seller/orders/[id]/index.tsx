import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import {
  Truck,
  ShieldCheck,
  PackageX,
  User,
  QrCode,
} from 'lucide-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../../src/theme/ThemeProvider';
import { Text } from '../../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../../src/lib/haptics';
import { useOrder } from '../../../../src/data/queries';
import { formatGNF } from '../../../../src/lib/format';
import { OrderResolutionBanner } from '../../../../src/components/orders/OrderResolutionBanner';
import { DetailStateScreen } from '../../../../src/components/feedback/DetailState';
import { useAuth } from '../../../../src/stores/auth';
import { useToast } from '../../../../src/components/feedback/Toast';

export default function SellerOrderDetailRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const meId = useAuth((s) => s.user?.id ?? s.authUserId);
  const toast = useToast();

  // Phase T.2 — owner check. confirm.tsx already guards buyer-side ; this
  // mirror covers the seller side. Wrong owner → bounce to home with a
  // calm toast, not an authoritative-looking 403 screen ; the user reached
  // here via a stale link, not a hostile probe.
  //
  // T.2.fix — also treat null meId as NOT owner. Fails open today only
  // because every seller-side caller is authed, but cheap to harden.
  const wrongOwner = !isLoading && !!order && (!meId || order.sellerId !== meId);
  useEffect(() => {
    if (wrongOwner) {
      toast.show(t('seller.shipWrongOwner'), 'info');
      router.replace('/(tabs)');
    }
  }, [wrongOwner, toast]);

  if (isLoading || wrongOwner) {
    // Spinner (not a blank screen) while loading or during the brief
    // wrong-owner redirect — on 3G the blank view read as a frozen screen.
    return <DetailStateScreen loading title={t('seller.orderDetailTitle')} />;
  }
  if (isError && !order) {
    return <DetailStateScreen loading={false} title={t('seller.orderDetailTitle')} onRetry={() => void refetch()} />;
  }
  if (!order) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('seller.orderDetailTitle')} subtitle={t('seller.orderDetailNotFound')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
          <PackageX size={28} color={colors.textFaint} strokeWidth={1.75} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
            {t('seller.orderDetailGoneTitle')}
          </Text>
          <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: 'center' }}>
            {t('seller.orderDetailGoneBody')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Phase X.9 — only 'paid' can be shipped. 'placed' = unpaid (mobile-money or
  // card pending) and the server rejects the transition ; if the seller saw the
  // CTA there they'd fill the whole form for a 400.
  const needsShip = order.status === 'paid';

  // Phase LIVREUR — delivery is READ-ONLY for the seller. The ADMIN assigns the
  // courier (central dispatch « Livraisons »). order.delivery (from get-order)
  // carries who's assigned + how far along it is, for display only. It's null
  // only in the brief window before get-order's delivery readback lands.
  const delivery = order.delivery ?? null;
  const deliveryAssignable = order.status === 'paid' || order.status === 'preparing';
  const livreurActive =
    !!delivery &&
    (delivery.status === 'assigned' || delivery.status === 'in_transit' || delivery.status === 'delivered');
  const showDeliverySection = !!delivery && (deliveryAssignable || livreurActive);

  // ─── REMISE EN MAIN PROPRE : scanner le QR de l'acheteur ──────────────────
  // Signale par le client le 2026-09-07 : « L'icône Scan n'apparaît pas dans
  // Commande reçue côté Vendeur ». C'etait exact, et ce n'etait pas un detail
  // d'affichage — c'etait le seul chemin manquant.
  //
  // Depuis le 2026-08-22 (« le client ne scanne jamais un QR, il génère
  // seulement un QR pour sa commande »), l'acheteur AFFICHE son QR et celui qui
  // remet la marchandise le scanne : le livreur pour une livraison, le VENDEUR
  // pour un retrait en boutique. Tout le serveur existait — seller_confirm_pickup,
  // sa fonction edge, le scanner, et l'ecran de confirmation qui aiguille deja
  // vendeur/acheteur. Il manquait uniquement le bouton ICI : la liste vendeur
  // mene a cet ecran, alors que le bouton de scan n'existait que sur
  // app/order/[id].tsx, ou un vendeur n'arrive jamais.
  //
  // CONSEQUENCE DU MANQUE, et pourquoi ca urgeait : sans ce bouton, un retrait
  // en boutique etait INCONFIRMABLE. L'argent restait au sequestre jusqu'a un
  // litige — le vendeur livrait sans etre paye.
  //
  // Les deux gardes reproduisent EXACTEMENT celles de seller_confirm_pickup,
  // pour que le bouton n'apparaisse jamais la ou le serveur refuserait :
  //   - statut : paid | preparing | delivered
  //   - AUCUN livreur assigne — sinon c'est lui qui confirme (LIVREUR_ASSIGNED),
  //     sans quoi un vendeur libererait le sequestre d'une commande encore en
  //     route, avant que l'acheteur ne l'ait recue.
  const inHandoffWindow =
    order.status === 'paid' || order.status === 'preparing' || order.status === 'delivered';
  const livreurHasIt = !!delivery && delivery.status !== 'unassigned';
  const canConfirmHandoff = inHandoffWindow && !livreurHasIt;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <ScreenHeader title={t('seller.orderDetailTitle')} subtitle={order.reference} />

        <View style={{ paddingHorizontal: 24 }}>
          <OrderResolutionBanner order={order} viewerRole="seller" />
        </View>

        {/* Remise en main propre — place HAUT, avant le detail produit : au
            comptoir, l'acheteur est devant le vendeur et c'est le seul geste
            qui compte. Le faire chercher en bas de page, c'est le meme
            probleme que de ne pas l'avoir du tout. */}
        {canConfirmHandoff && (
          <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
            <View
              style={{
                padding: 16,
                borderRadius: 18,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <QrCode size={16} color={colors.text} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                  Remettre la commande
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12.5,
                  color: colors.textMuted,
                  lineHeight: 18,
                  marginBottom: 14,
                }}
              >
                Demande à l&apos;acheteur d&apos;ouvrir sa commande dans Linky et scanne le QR
                affiché sur son écran. Tes fonds sont libérés immédiatement.
              </Text>
              <Pressable
                onPress={() => {
                  haptic.medium();
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`.
                  router.push('/scan' as any);
                }}
                style={{
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: colors.text,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <QrCode size={16} color={colors.bg} strokeWidth={2.25} />
                <Text
                  style={{
                    fontSize: 14.5,
                    fontWeight: '700',
                    color: colors.bg,
                    lineHeight: 18,
                    includeFontPadding: false,
                  }}
                >
                  Scanner le QR de l&apos;acheteur
                </Text>
              </Pressable>
            </View>
          </View>
        )}

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
        <Section title={t('seller.orderDetailSectionPayment')}>
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
            <BreakLine label={t('seller.orderDetailLineItem')} value={formatGNF(order.amountGnf)} />
            <BreakLine label={t('seller.orderDetailLineFees')} value={formatGNF(order.feesGnf)} muted />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <BreakLine label={t('seller.orderDetailLineYouReceive')} value={formatGNF(order.amountGnf)} bold />
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
                {t('seller.orderDetailEscrowNote')}
              </Text>
            </View>
          </View>
        </Section>

        {/* Delivery — READ-ONLY for the seller; the admin assigns the courier (Phase LIVREUR) */}
        {showDeliverySection && delivery && (
          <Section title={t('seller.orderDetailSectionDelivery')}>
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
              {livreurActive && delivery.livreurName ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        backgroundColor: colors.bgSunken,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <User size={18} color={colors.primary} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6 }}>
                        {t('seller.deliveryLivreurLabel').toUpperCase()}
                      </Text>
                      <Text
                        style={{ fontSize: 14.5, fontWeight: '700', color: colors.text, marginTop: 2, letterSpacing: 0 }}
                        numberOfLines={1}
                      >
                        {delivery.livreurName}
                        {delivery.city ? ` · ${delivery.city}` : ''}
                      </Text>
                    </View>
                  </View>

                  {delivery.status === 'in_transit' && (
                    <Text style={{ fontSize: 12.5, color: colors.textMuted, letterSpacing: 0 }}>
                      {t('seller.deliveryInTransitNote')}
                    </Text>
                  )}
                  {delivery.status === 'delivered' && (
                    <Text style={{ fontSize: 12.5, color: colors.textMuted, letterSpacing: 0 }}>
                      {t('seller.deliveryDeliveredNote')}
                    </Text>
                  )}

                  {/* SUIVRE LE LIVREUR, COTE VENDEUR AUSSI.
                      Client, 2026-09-25 : « un suivi des commandes en temps reel
                      pour les DEUX PARTIES lorsque c'est une livraison, avec
                      position du livreur sur Map ».

                      L'ecran /track existait deja et le serveur servait deja le
                      vendeur : get-order autorise l'acheteur ET le vendeur, et
                      livreurLocation n'est PAS bride a l'acheteur. Il manquait
                      uniquement la porte d'entree ici — le bouton n'existait que
                      sur l'ecran de l'acheteur.

                      Memes conditions que chez lui : seulement tant qu'une
                      course est en cours. Une fois livree, il n'y a plus rien a
                      suivre, et montrer une derniere position figee laisserait
                      croire que le livreur est encore en route. */}
                  {(delivery.status === 'assigned' || delivery.status === 'in_transit') && (
                    <Pressable
                      onPress={() => {
                        haptic.selection();
                        router.push(`/track/${order.id}` as never);
                      }}
                      style={{
                        height: 48,
                        borderRadius: 14,
                        backgroundColor: colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 8,
                      }}
                    >
                      <Truck size={16} color="#FFFFFF" strokeWidth={2} />
                      <Text style={{ fontSize: 14.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0 }}>
                        {t('seller.deliveryTrackCta')}
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 18, letterSpacing: 0 }}>
                  {t('seller.deliveryAdminAssignNote')}
                </Text>
              )}
            </View>
          </Section>
        )}

        {/* Timeline events */}
        <Section title={t('seller.orderDetailSectionTimeline')}>
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

      {/* Sticky CTA — only render when there's an action (ship) or a wait
          state (placed/unpaid) to show, so other statuses don't leave an
          empty bordered bar. */}
      {(needsShip || order.status === 'placed') && (
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
              {t('seller.orderDetailMarkShipped')}
            </Text>
          </Pressable>
        ) : (
          // 'placed' = payment still pending. Explain the empty action area so
          // the seller knows the order is recognized, just not shippable yet.
          <View style={{ height: 56, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.textMuted }}>
              {t('seller.orderDetailAwaitingPayment')}
            </Text>
          </View>
        )}
      </SafeAreaView>
      )}
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

