import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useStripe, PaymentSheetError } from '@stripe/stripe-react-native';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import { useMyAddresses } from '../../src/data/queries/addresses';
import { DELIVERY_FEE_GNF, type DeliveryMode } from '../../src/lib/delivery';
import type { PaymentMethod, Product } from '../../src/data/types';
import { useToast } from '../../src/components/feedback/Toast';

interface MethodOption {
  id: PaymentMethod;
  name: string;
  hint: string;
  badge: string;
  badgeColor: string;
  /** Foreground of the fallback badge. MTN's mark is black-on-yellow; white
   *  text on that yellow is barely readable and looks nothing like the brand. */
  badgeFg?: string;
  /** Real brand artwork. Drop the file in assets/images and point `logo` at it
   *  (require('...')) — the tile then renders the logo instead of the lettered
   *  badge, with no other change. Left unset until the client supplies the
   *  official Orange Money / MTN MoMo files; approximating a trademark by hand
   *  would look worse than the clean badge and misrepresent their brand. */
  logo?: number;
  iconKey?: IconKey;
  /** Mobile-money rails go live once the client signs the Lengopay contract.
   *  Until then they're shown but not selectable — card is the active path. */
  comingSoon?: boolean;
}

// Google Pay test mode must follow the KEY, not a hardcoded flag — otherwise
// the prod key swap would silently leave Google Pay in test mode.
const STRIPE_TEST_MODE = (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_test_');

// Phase I.8 / I.9 — name + hint come from i18n at render so they flip with
// language. Brand colors + badge codes are stable.
// 2026-07-07 — Lengopay merchant account live (licence verified against the
// production API), rails un-dimmed: place-order returns the hosted
// payment_url the buyer approves on.
const METHOD_DEFS: { id: PaymentMethod; nameKey: string; hintKey: string; badge: string; badgeColor: string; badgeFg?: string; logo?: number; comingSoon?: boolean }[] = [
  // Brand colours are the official ones: Orange #FF7900 (white mark), MTN
  // #FFCB05 with a BLACK wordmark — MTN is never written in white.
  { id: 'orange-money', nameKey: 'checkout.rails.orangeMoney', hintKey: 'checkout.rails.orangeMoneyHint', badge: 'OM', badgeColor: '#FF7900', logo: require('../../assets/images/pay-orange-money.png') },
  { id: 'mtn-money', nameKey: 'checkout.rails.mtnMoney', hintKey: 'checkout.rails.mtnMoneyHint', badge: 'MTN', badgeColor: '#FFCB05', badgeFg: '#000000', logo: require('../../assets/images/pay-mtn-momo.png') },
];

export default function CheckoutRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Default to mobile money — the real Guinea rail. Card (Stripe) is hidden
  // (client 2026-07-26: Guinean cards are refused by Stripe).
  const [selected, setSelected] = useState<PaymentMethod>('orange-money');
  const METHODS: MethodOption[] = useMemo(
    () =>
      METHOD_DEFS.map((m) => ({
        id: m.id,
        name: t(m.nameKey),
        hint: t(m.hintKey),
        badge: m.badge,
        badgeColor: m.badgeColor,
        badgeFg: m.badgeFg,
        logo: m.logo,
        comingSoon: m.comingSoon,
      })),
    [t],
  );
  const lines = useCart((s) => s.lines);
  const placeOrder = usePlaceOrder();
  const { show } = useToast();
  // Mode de réception (client 2026-07-30). Livraison Linky par défaut (frais
  // forfaitaire) ; retrait boutique gratuit. La livraison a besoin d'une adresse
  // de destination : on lit le carnet d'adresses et on exige l'adresse par défaut.
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('delivery');
  const addressesQuery = useMyAddresses();
  const defaultAddress = useMemo(
    () => (addressesQuery.data ?? []).find((a) => a.is_default) ?? (addressesQuery.data ?? [])[0],
    [addressesQuery.data],
  );
  // Prompt to add an address ONLY once the query has SUCCESSFULLY returned with
  // no default — never on a transient error (the buyer may well have a saved
  // address; the server trigger resolves the real destination anyway). Blocking
  // on error would refuse a legitimate delivery checkout on a flaky 3G link.
  const needsAddress = deliveryMode === 'delivery' && addressesQuery.isSuccess && !defaultAddress;
  // While the address query is still loading, the delivery gate isn't decided
  // yet — keep the Payer button disabled so a fast tap can't create a delivery
  // order in the loading window (before we know whether an address exists).
  const addressGateLoading = deliveryMode === 'delivery' && addressesQuery.isLoading;
  const walletQuery = useWallet();
  const wallet = walletQuery.data;
  // Phase U.0d — most decision-sensitive money surface on the app ; the
  // bare wallet?.balanceGnf ?? 0 read 0 GNF confidently while the query
  // was still loading or had errored, framing a wallet payment as
  // impossible.
  const walletReady = !walletQuery.isLoading && !walletQuery.isError && !!wallet;
  // Wallet restructure : the balance is earnings-funded only (no top-up), so
  // the wallet rail is offered only when there's something to spend.
  const walletPayable = walletReady && (wallet?.balanceGnf ?? 0) > 0;
  // If a background refetch drops the balance to 0 while 'wallet' is selected,
  // the row unmounts — snap the selection back to card so the radio state,
  // info panel and the Payer action can never disagree with the visible UI.
  useEffect(() => {
    if (selected === 'wallet' && !walletPayable) setSelected('orange-money');
  }, [selected, walletPayable]);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  // Keeps the Payer button busy across the whole sheet flow (place-order →
  // init → present), not just the mutation.
  const [cardFlowBusy, setCardFlowBusy] = useState(false);

  // Phase Q — card checkout via the Stripe payment sheet. Whatever happens
  // after place-order succeeds (sheet success, sheet cancel, init failure),
  // the confirmation screen is the destination : it polls get-order and shows
  // the same pending / paid / cancelled states as the Lengopay rail.
  async function handleCardOrder() {
    if (lines.length === 0) return;
    setCardFlowBusy(true);
    try {
      // The WHOLE cart goes into one order — every article shares the same shop,
      // so it stays one escrow, one delivery, one QR (client 2026-08-05).
      const { order, payment } = await placeOrder.mutateAsync({
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        paymentMethod: 'card',
        deliveryMode,
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
  const serviceFee = Math.round(subtotal * 0.03);
  // Le frais de livraison DOIT refléter la valeur serveur (delivery.ts) : le
  // serveur recalcule le forfait, ici on montre juste le même montant.
  const deliveryFee = deliveryMode === 'delivery' ? DELIVERY_FEE_GNF : 0;
  const total = subtotal + serviceFee + deliveryFee;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('checkout.title')} back />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        {/* Mode de réception (client 2026-07-30) : livraison Linky ou retrait. */}
        <MicroLabel label="Mode de réception" />
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: needsAddress || deliveryMode === 'delivery' ? 8 : 16 }}>
          {/* Retrait FIRST, livraison second (client 2026-08-07): the address
              card renders right under this list, so putting delivery last
              places it immediately above the address it belongs to. Order is
              presentation only — 'delivery' stays the default selection. */}
          {([
            { mode: 'pickup' as DeliveryMode, icon: 'store' as IconKey, title: 'Retrait sur place', hint: 'Vous récupérez à la boutique — Gratuit' },
            { mode: 'delivery' as DeliveryMode, icon: 'truck' as IconKey, title: 'Livraison à domicile', hint: `Linky vous livre — ${formatGNF(DELIVERY_FEE_GNF)}` },
          ]).map((opt, i) => {
            const sel = deliveryMode === opt.mode;
            const Ico = I[opt.icon];
            return (
              <Pressable
                key={opt.mode}
                onPress={() => setDeliveryMode(opt.mode)}
                style={{
                  padding: 14,
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  borderBottomWidth: i === 0 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
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
                  <Ico size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600' }}>{opt.title}</Text>
                  <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', fontVariant: ['tabular-nums'] }}>
                    {opt.hint}
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

        {/* Adresse de livraison — requise quand « Livraison » est choisie. */}
        {deliveryMode === 'delivery' && (
          <Pressable
            onPress={() => router.push('/settings/addresses' as any)}
            style={{ marginBottom: 16 }}
          >
            <Card padding={12}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <I.pin size={16} color={needsAddress ? colors.danger : colors.primary} />
                <View style={{ flex: 1 }}>
                  {addressesQuery.isLoading ? (
                    <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                      Chargement de l'adresse…
                    </Text>
                  ) : defaultAddress ? (
                    <>
                      <Text style={{ fontSize: 13, fontWeight: '600' }}>{defaultAddress.label}</Text>
                      <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                        {[defaultAddress.district, defaultAddress.city].filter(Boolean).join(', ')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger }}>
                        Aucune adresse de livraison
                      </Text>
                      <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                        Ajoute une adresse pour être livré
                      </Text>
                    </>
                  )}
                </View>
                <Text variant="micro" style={{ color: colors.primary, fontWeight: '600', letterSpacing: 0, textTransform: 'none' }}>
                  {defaultAddress ? 'Modifier' : 'Ajouter'}
                </Text>
              </View>
            </Card>
          </Pressable>
        )}

        <MicroLabel label={t('checkout.sectionMobileMoney')} />
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: 16 }}>
          {METHODS.map((m, i) => {
            const sel = selected === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => {
                  if (m.comingSoon) {
                    show(t('checkout.comingSoonToast'), 'info');
                    return;
                  }
                  setSelected(m.id);
                }}
                style={{
                  padding: 14,
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  borderBottomWidth: i < METHODS.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                  opacity: m.comingSoon ? 0.55 : 1,
                }}
              >
                {m.logo ? (
                  // Artwork fills the tile edge to edge (client 2026-08-07) —
                  // no inner padding, `cover` rather than `contain`. Both files
                  // are square, so cover crops nothing. `overflow: hidden` is
                  // what keeps the corners rounded once the image bleeds out.
                  // The white ground still shows through any transparency:
                  // operator logos are drawn for light backgrounds and the
                  // Orange mark would otherwise vanish on the dark theme.
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: '#FFFFFF',
                      overflow: 'hidden',
                    }}
                  >
                    <Image
                      source={m.logo}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  </View>
                ) : (
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
                    <Text style={{ color: m.badgeFg ?? '#FFFFFF', fontWeight: '800', fontSize: m.badge.length > 2 ? 12 : 14, letterSpacing: 0.2 }}>
                      {m.badge}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600' }}>{m.name}</Text>
                  <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', fontVariant: ['tabular-nums'] }}>
                    {m.hint}
                  </Text>
                </View>
                {m.comingSoon ? (
                  <View style={{ paddingHorizontal: 10, height: 22, borderRadius: 999, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.accentText }}>{t('checkout.comingSoonBadge')}</Text>
                  </View>
                ) : (
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
                )}
              </Pressable>
            );
          })}
        </Card>

        <Text variant="micro" tone="muted" style={{ marginTop: -8, marginBottom: 16, paddingHorizontal: 4, letterSpacing: 0, textTransform: 'none', lineHeight: 15 }}>
          {t('checkout.rails.mobileMoneyNote')}
        </Text>

        {/* « Autre » = wallet only. Card (Stripe) removed from the UI — it
            doesn't work for Guinean cards (client 2026-07-26). The section only
            shows when the wallet has a spendable balance. */}
        {walletPayable && (
          <>
            <MicroLabel label={t('checkout.sectionOther')} />
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
                  <Text style={{ fontSize: 13, fontWeight: '600' }}>{t('checkout.walletLinky')}</Text>
                  <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', fontVariant: ['tabular-nums'] }}>
                    {t('checkout.walletBalance', { amount: walletReady ? formatGNF(wallet!.balanceGnf) : '—' })}
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
          </>
        )}

        <Card padding={12}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <I.info size={16} color={colors.primary} />
            <Text variant="micro" tone="muted" style={{ flex: 1, lineHeight: 16, letterSpacing: 0, textTransform: 'none' }}>
              {selected === 'card'
                ? t('checkout.infoCard')
                : selected === 'mtn-money'
                  ? t('checkout.infoMobileMtn')
                  : t('checkout.infoMobileOrange')}
            </Text>
          </View>
        </Card>

        {/* Récapitulatif (client 2026-07-30, étape 1 du parcours) — le client
            voit le détail exact avant de payer. */}
        <MicroLabel label="Récapitulatif" />
        <Card padding={14}>
          <RecapRow label="Sous-total" value={formatGNF(subtotal)} />
          <RecapRow label="Frais de service" value={formatGNF(serviceFee)} />
          <RecapRow
            label={deliveryMode === 'delivery' ? 'Livraison' : 'Retrait sur place'}
            value={deliveryMode === 'delivery' ? formatGNF(deliveryFee) : 'Gratuit'}
          />
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700' }}>Total</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatGNF(total)}</Text>
          </View>
        </Card>
      </ScrollView>

      <StickyBottom>
        <Button
          size="lg"
          block
          loading={placeOrder.isPending || cardFlowBusy}
          disabled={placeOrder.isPending || cardFlowBusy || !allLoaded || lines.length === 0 || addressGateLoading}
          label={
            placeOrder.isPending || cardFlowBusy
              ? t('checkout.payingCta')
              : needsAddress
                ? 'Ajouter une adresse de livraison'
                : t('checkout.payCta', { amount: formatGNF(total) })
          }
          onPress={() => {
            // Livraison sans adresse : on ne prend pas le paiement — on envoie
            // d'abord ajouter une adresse de destination.
            if (needsAddress) {
              router.push('/settings/addresses' as any);
              return;
            }
            const first = lines[0];
            if (!first) return;
            if (selected === 'card') {
              void handleCardOrder();
              return;
            }
            placeOrder.mutate(
              {
                items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
                paymentMethod: selected,
                deliveryMode,
              },
              {
                onSuccess: ({ order, intent }) => {
                  if (intent) {
                    // Rail path: the Lengopay page (Orange/MTN) opens IN-APP in
                    // a WebView (client 2026-07-26) — no external browser. The
                    // pay screen routes on to the confirmation screen, which
                    // polls until the cron flips the intent.
                    // Phase U.3 — DO NOT clear cart yet ; the rail can still
                    // fail or be cancelled. Clear lives in the SUCCESS branch
                    // of confirm/[orderId].tsx.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-router typed-routes regenerate on next `expo start`; routes exist on disk.
                    if (intent.paymentUrl) {
                      router.replace({ pathname: '/checkout/pay', params: { url: intent.paymentUrl, orderId: order.id } } as any);
                    } else {
                      router.replace(`/checkout/confirm/${order.id}` as any);
                    }
                  } else {
                    // Wallet path (no intent): order already at status='paid'.
                    // Phase U.3 — wallet payment is instant + non-cancellable
                    // from the buyer side, so this is the actual moment of
                    // payment success → safe to clear.
                    useCart.getState().clear();
                    show(t('checkout.orderCreated'), 'success');
                    router.replace(`/checkout/success?orderId=${order.id}`);
                  }
                },
                onError: (err: unknown) => {
                  const msg = (err as { message?: string })?.message ?? t('checkout.payErrorFallback');
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

// Ligne du récapitulatif : libellé à gauche (atténué), montant à droite en
// chiffres tabulaires pour un alignement propre des GNF.
function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
      <Text tone="muted" style={{ fontSize: 13, letterSpacing: 0, textTransform: 'none' }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
