// Buy a boost — pick one of your active listings (a product OR a property),
// pick a duration tier, pay from the wallet. Price is server-authoritative
// (create-boost re-derives it from days); this screen only sends
// { productId | propertyId, days }. Insufficient balance surfaces a message.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useStripe, PaymentSheetError } from '@stripe/stripe-react-native';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { Input } from '../../../src/components/primitives/Input';
import { TopBar } from '../../../src/components/nav/TopBar';
import { formatGNF } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';
import { useToast } from '../../../src/components/feedback/Toast';
import { ApiError, toToastMessage } from '../../../src/lib/api';
import { formatGnPhone } from '../../../src/lib/gnPhone';
import { usePayerPhone } from '../../../src/lib/payerPhone';
import { PaymentMethodPicker } from '../../../src/components/payment/PaymentMethodPicker';
import {
  useBoosts,
  useCreateBoost,
  useMyShops,
  useMyProperties,
  useProducts,
  useWallet,
  type BoostPayMethod,
} from '../../../src/data/queries';



type Selection = { kind: 'product' | 'property'; id: string };

export default function BoostNewRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();

  const { data: shops } = useMyShops();
  // Products hang off the BOUTIQUE. Since boutique and agence immo became
  // separate rows (2026-08-07), shops[0] could be the agency — which returned
  // zero products and made the boost picker look empty for sellers who also
  // list real estate.
  const myShop = shops?.find((s) => (s.kind ?? 'shop') === 'shop');
  const { data: products } = useProducts({ shopId: myShop?.id });
  const { data: properties } = useMyProperties();
  // Only the caller's OWN products are boostable. useProducts({ shopId }) returns
  // EVERY marketplace product (minus own) while myShop.id is still undefined —
  // surfacing other sellers' listings that then fail the RPC ownership check
  // (« Cette annonce ne t'appartient pas »). Filter to the caller's shop ids so
  // the picker can only ever show boostable listings (client 2026-07-31).
  const myShopIds = useMemo(() => new Set((shops ?? []).map((s) => s.id)), [shops]);
  const activeProducts = useMemo(
    () => (products ?? []).filter((p) => p.status === 'active' && myShopIds.has(p.shopId)),
    [products, myShopIds],
  );
  const activeProperties = useMemo(
    () => (properties ?? []).filter((p) => p.status === 'active'),
    [properties],
  );
  const hasListings = activeProducts.length > 0 || activeProperties.length > 0;

  const { data: boostData } = useBoosts();
  const tiers = boostData?.tiers ?? [];
  const wallet = useWallet();
  const create = useCreateBoost();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  // Pre-select when arriving from a listing's edit screen ("Booster cette
  // annonce"). Either productId or propertyId is passed; falls back to the
  // manual picker otherwise.
  const { productId: preProduct, propertyId: preProperty } =
    useLocalSearchParams<{ productId?: string; propertyId?: string }>();
  const [selected, setSelected] = useState<Selection | null>(
    typeof preProperty === 'string'
      ? { kind: 'property', id: preProperty }
      : typeof preProduct === 'string'
        ? { kind: 'product', id: preProduct }
        : null,
  );
  const [days, setDays] = useState<number | null>(null);
  const selectedTier = tiers.find((x) => x.days === days) ?? null;
  const [method, setMethod] = useState<BoostPayMethod>('wallet');
  // Le portefeuille est le choix par defaut, mais le selecteur partage ne
  // l'AFFICHE que s'il peut reellement payer (solde > 0). Sans ce rattrapage,
  // un vendeur au solde vide — le cas meme pour lequel le rail mobile money a
  // ete ouvert en aout — voyait une liste sans rien de selectionne, puis un
  // « Solde insuffisant » au moment de payer, pour un moyen de paiement qu'il
  // n'avait jamais choisi. Le panier a exactement ce garde-fou depuis toujours.
  const walletPayable = (wallet.data?.balanceGnf ?? 0) > 0;
  useEffect(() => {
    if (method === 'wallet' && !wallet.isLoading && !walletPayable) setMethod('orange-money');
  }, [method, wallet.isLoading, walletPayable]);
  // Compte inscrit par email, sans numero enregistre — meme trou que corrige
  // cote commandes le 2026-08-25 (create-boost l'exigeait deja cote serveur,
  // useCreateBoost savait deja l'envoyer, mais rien a l'ecran ne le demandait).
  // Doit rester d'accord avec LENGOPAY_RAILS[...].needsAccount cote serveur :
  // Kulu encaisse SUR un numero, comme Orange et MTN.
  // PayCard aussi : elle encaisse sur un numero ET sur un numero de compte.
  const mobileMoneySelected = method === 'orange-money' || method === 'mtn-money'
    || method === 'kulu' || method === 'paycard';
  // Le numero QUI PAIE — voir src/lib/payerPhone.ts. Toujours propose pour le
  // mobile money (la diaspora pilote un compte OM/MTN guineen a distance,
  // client 2026-09-05), pre-rempli avec celui du compte s'il est guineen.
  const payerPhone = usePayerPhone();
  const needsPayerPhone = mobileMoneySelected && !payerPhone.loading;
  const payerPhoneValid = !mobileMoneySelected || payerPhone.valid;
  const payerPhoneE164 = payerPhone.e164;
  // Numero de compte PayCard. Il ne quitte l'appareil que dans l'appel
  // d'initialisation : ni stocke, ni journalise.
  const [payerCard, setPayerCard] = useState('');
  const payerCardDigits = payerCard.replace(/\D/g, '');
  const payerCardValid = method !== 'paycard' || payerCardDigits.length >= 6;

  const onPay = async () => {
    if (!selected || !selectedTier || create.isPending) return;
    try {
      haptic.medium();
      const target =
        selected.kind === 'property'
          ? { propertyId: selected.id }
          : { productId: selected.id };
      const res = await create.mutateAsync({
        ...target, days: selectedTier.days, method, payerPhone: payerPhoneE164,
        ...(method === 'paycard' && payerCardDigits ? { payerCard: payerCardDigits } : {}),
      });

      // Carte : feuille Stripe native, exactement comme la reservation. Le
      // boost reste 'pending_payment' — c'est le webhook qui l'activera.
      if (res.kind === 'card') {
        const { error: initErr } = await initPaymentSheet({
          merchantDisplayName: 'Linky',
          paymentIntentClientSecret: res.clientSecret,
          returnURL: 'linky://stripe-redirect',
        });
        if (initErr) {
          toast.show('Impossible de préparer le paiement', 'danger');
          return;
        }
        const { error: payErr } = await presentPaymentSheet();
        if (payErr) {
          // Fermer la feuille ne doit rien declencher d'autre que sa propre
          // fermeture — meme correctif que le panier le 2026-08-25.
          if (payErr.code === PaymentSheetError.Canceled) {
            toast.show('Paiement annulé.', 'info');
            return;
          }
          toast.show(payErr.message || 'Paiement échoué', 'danger');
          return;
        }
        // NE PAS annoncer « boost actif » ici : a cet instant le boost est
        // encore 'pending_payment'. C'est le webhook qui l'activera, une a deux
        // secondes plus tard.
        toast.show(t('pro.boostPendingToast'), 'info');
        router.replace('/pro/boost?pending=1');
        return;
      }

      // Soutra Money / carte Lengopay : le vendeur finit sur la page du rail,
      // dans la WebView de l'appli. La fermer renvoie a /pro/boost?pending=1,
      // qui rafraichit en attendant que le cron confirme — l'issue ne depend
      // jamais de ce que la page affichait.
      if (res.kind === 'webview') {
        router.replace({
          pathname: '/checkout/pay',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`.
          params: { url: res.url, boostId: res.boostId },
        } as any);
        return;
      }

      // Kulu : le vendeur saisit le code recu par SMS.
      if (res.kind === 'otp') {
        router.replace({
          pathname: '/checkout/otp',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`.
          params: { payId: res.payId, boostId: res.boostId },
        } as any);
        return;
      }

      // Mobile money : rien n'est paye a cet instant. Depuis Lengopay v2
      // (2026-09-05) la demande part directement chez l'operateur — le vendeur
      // confirme sur son telephone et le boost ne s'activera que quand le cron
      // aura vu l'encaissement. Surtout pas de toast de succes ici.
      if (res.kind === 'pending') {
        toast.show(t('pro.boostPendingToast'), 'info');
        router.replace('/pro/boost?pending=1');
        return;
      }

      toast.show(t('pro.boostSuccessToast'), 'success');
      router.replace('/pro/boost');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_FUNDS') {
        toast.show(t('pro.boostInsufficientBody'), 'danger');
        return;
      }
      toast.show(toToastMessage(e, t('pro.boostErrorToast')), 'danger');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('pro.boostNewTitle')} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 40 }}>
        <Text tone="muted" variant="micro" style={{ letterSpacing: 0, textTransform: 'none' }}>
          {t('pro.boostWalletBalance', { balance: formatGNF(wallet.data?.balanceGnf ?? 0) })}
        </Text>

        <View style={{ gap: 10 }}>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0.5 }}>
            {t('pro.boostPickListing').toUpperCase()}
          </Text>
          {!hasListings ? (
            <View
              style={{
                padding: 20,
                borderRadius: 16,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Text tone="muted" center style={{ letterSpacing: 0, textTransform: 'none' }}>
                {t('pro.boostNoListings')}
              </Text>
              <Button
                label={t('pro.boostGoCreate')}
                variant="secondary"
                onPress={() => router.replace('/create')}
              />
            </View>
          ) : (
            <>
              {activeProducts.map((p) => (
                <ListingOption
                  key={`prod-${p.id}`}
                  title={p.title}
                  subtitle={formatGNF(p.priceGnf)}
                  kindLabel={t('proDashboard.kindProduct')}
                  photo={p.photos?.[0]}
                  selected={selected?.kind === 'product' && selected.id === p.id}
                  onSelect={() => {
                    haptic.light();
                    setSelected({ kind: 'product', id: p.id });
                  }}
                />
              ))}
              {activeProperties.map((p) => (
                <ListingOption
                  key={`prop-${p.id}`}
                  title={p.title}
                  subtitle={formatGNF(p.priceGnf)}
                  kindLabel={t('proDashboard.kindProperty')}
                  photo={p.photos?.[0]}
                  selected={selected?.kind === 'property' && selected.id === p.id}
                  onSelect={() => {
                    haptic.light();
                    setSelected({ kind: 'property', id: p.id });
                  }}
                />
              ))}
            </>
          )}
        </View>

        {hasListings && (
          <View style={{ gap: 10 }}>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0.5 }}>
              {t('pro.boostPickDuration').toUpperCase()}
            </Text>
            {tiers.map((tier) => (
              <DurationOption
                key={tier.days}
                label={t('pro.boostDays', { count: tier.days })}
                price={formatGNF(tier.amountGnf)}
                selected={tier.days === days}
                onSelect={() => {
                  haptic.light();
                  setDays(tier.days);
                }}
              />
            ))}
          </View>
        )}

        {hasListings && (
          <View style={{ gap: 10 }}>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0.5 }}>
              {t('pro.boostPickMethod').toUpperCase()}
            </Text>
            {/* Meme selecteur que le panier et la reservation (client
                2026-09-04 : « unifier les methodes de paiement dans l'appli »).
                Le boost affichait Orange et MTN comme DEUX lignes distinctes,
                alors que le panier avait deja fusionne les deux : le choix
                d'operateur se fait sur la page Lengopay, le poser ici ne
                servait a rien.
                La carte est ouverte depuis le 2026-09-07 (client : « Pareil
                pour le boost aussi »), sur LES DEUX profils : a l'etranger elle
                part chez Stripe et rend un client_secret ; en Guinee elle part
                chez Lengopay ('lengopay-card') et rend une page ou un code.
                create-boost accepte les sept moyens. */}
            <PaymentMethodPicker
              value={method}
              onChange={(m) => {
                haptic.light();
                setMethod(m as BoostPayMethod);
              }}
              walletBalanceGnf={wallet.data?.balanceGnf ?? null}
            />
          </View>
        )}

        {/* Numero de compte PayCard — sans ce champ, create-boost rejetterait
            sec avec CARD_NUMBER_REQUIRED et rien a l'ecran ne permettrait d'y
            repondre (meme defaut que le champ telephone corrigeait plus haut). */}
        {hasListings && method === 'paycard' && (
          <Input
            label={t('checkout.paycardLabel')}
            leadingIcon="card"
            keyboardType="number-pad"
            placeholder={t('checkout.paycardPlaceholder')}
            value={payerCard}
            onChangeText={setPayerCard}
            helperText={t('checkout.paycardHint')}
          />
        )}

        {/* Compte sans numero (inscrit par email) : sans ce champ, create-boost
            rejetait sec avec « Numero de paiement requis » et rien a l'ecran
            ne permettait d'agir dessus. */}
        {hasListings && needsPayerPhone && (
          <Input
            label={t('checkout.payerPhoneLabel')}
            leadingIcon="phone"
            keyboardType="phone-pad"
            placeholder={t('checkout.payerPhonePlaceholder')}
            value={formatGnPhone(payerPhone.digits)}
            onChangeText={payerPhone.onChange}
            errorText={
              payerPhone.digits.length > 0 && !payerPhone.valid
                ? t('checkout.payerPhoneInvalid')
                : undefined
            }
            helperText={payerPhone.digits.length === 0 ? t('checkout.payerPhoneHint') : undefined}
          />
        )}

        {hasListings && (
          <Button
            label={
              selectedTier
                ? t('pro.boostPayCta', { price: formatGNF(selectedTier.amountGnf) })
                : t('pro.boostNewCta')
            }
            block
            variant="primary"
            // `wallet.isLoading` compte : c'est la valeur par defaut de `method`,
            // et le selecteur MASQUE la ligne Portefeuille tant que le solde est
            // inconnu. Sur une liaison lente, le vendeur voyait donc une liste
            // sans rien de coche et pouvait quand meme appuyer — envoyant
            // 'wallet', un moyen qu'il n'avait jamais choisi (soit un « Solde
            // insuffisant » inexplicable, soit un debit silencieux de son
            // portefeuille). Le rattrapage de :96 ne s'arme qu'une fois le solde
            // connu ; ce garde-fou couvre la fenetre d'avant.
            disabled={!selected || !selectedTier || create.isPending || !payerPhoneValid || !payerCardValid || wallet.isLoading}
            loading={create.isPending}
            onPress={() => void onPay()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ListingOption({
  title,
  subtitle,
  kindLabel,
  photo,
  selected,
  onSelect,
}: {
  title: string;
  subtitle: string;
  kindLabel: string;
  photo?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onSelect}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 16,
        backgroundColor: colors.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
      }}
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.bgSunken }}
          contentFit="cover"
        />
      ) : (
        <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.bgSunken }} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.4 }}>
          {kindLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: '700', color: colors.text, letterSpacing: 0, marginTop: 1 }}
        >
          {title}
        </Text>
        <Text tone="muted" variant="micro" style={{ letterSpacing: 0, textTransform: 'none', marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.border,
          backgroundColor: selected ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

function DurationOption({
  label,
  price,
  selected,
  onSelect,
}: {
  label: string;
  price: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onSelect}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 16,
        backgroundColor: selected ? colors.primarySoft : colors.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: 0 }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 15,
          fontWeight: '700',
          color: selected ? colors.primaryDeep : colors.text,
          letterSpacing: 0,
        }}
      >
        {price}
      </Text>
    </Pressable>
  );
}
