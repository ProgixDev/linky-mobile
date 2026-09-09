import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
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
import { PAY_LOGOS } from '../../src/lib/paymentLogos';
import { useBuyerGate } from '../../src/components/feedback/BuyerGate';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { Input } from '../../src/components/primitives/Input';
import { I, type IconKey } from '../../src/icons/Icon';
import { formatGNF } from '../../src/lib/format';
import { platformFeeGnf } from '../../src/lib/fees';
import { useCart } from '../../src/stores/cart';
import { apiPost } from '../../src/lib/api';
import { usePlaceOrder, usePlaceOrdersBatch, useWallet, useCancelPendingPayment, useDeliveryQuote } from '../../src/data/queries';
import { useMyAddresses } from '../../src/data/queries/addresses';
import { DELIVERY_FEE_GNF, type DeliveryMode } from '../../src/lib/delivery';
import { usePaymentProfile } from '../../src/lib/paymentProfile';
import { formatGnPhone } from '../../src/lib/gnPhone';
import { usePayerPhone } from '../../src/lib/payerPhone';
import type { PaymentMethod, Product } from '../../src/data/types';
import { useToast } from '../../src/components/feedback/Toast';


// Google Pay test mode must follow the KEY, not a hardcoded flag — otherwise
// the prod key swap would silently leave Google Pay in test mode.
const STRIPE_TEST_MODE = (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_test_');

// Phase I.8 / I.9 — name + hint come from i18n at render so they flip with
// language. Brand colors + badge codes are stable.
// 2026-07-07 — Lengopay merchant account live (licence verified against the
// production API), rails un-dimmed: place-order returns the hosted
// payment_url the buyer approves on.
// Client 2026-08-23 : UNE seule carte pour le mobile money, portant les deux
// logos. Choisir Orange ou MTN ici n'avait aucun effet — les deux ouvrent la
// MEME page hebergee Lengopay, ou l'operateur se choisit vraiment. Le choix
// etait donc pose deux fois, et le premier ne servait a rien : au mieux du
// bruit, au pire un acheteur convaincu d'avoir deja designe son operateur.
// Les logos vivent dans src/lib/paymentLogos.ts : cet ecran et
// PaymentMethodPicker en chargeaient chacun sa copie.
const MOBILE_MONEY_LOGOS: number[] = [PAY_LOGOS.orangeMoney, PAY_LOGOS.mtnMomo];

// Valeur transmise au serveur. La page hebergee laissant le payeur choisir son
// operateur, cette etiquette n'est qu'une reference portee par l'intention de
// paiement — booking-sign-pay procede deja exactement ainsi.
const MOBILE_MONEY_METHOD: PaymentMethod = 'orange-money';

// ─── Rail CARTE — pose mais ETEINT (client 2026-08-24) ──────────────────────
// Le compte Stripe existe (americain, cle pk_live active), le code du paiement
// carte est intact et le webhook repond correctement a nos sondes. Il manque UNE
// chose : la certitude que l'adresse enregistree DANS le tableau de bord Stripe
// pointe sur le serveur actuel et non sur le projet decommissionne en juillet.
//
// Tant que ce n'est pas verifie, activer ce bouton produirait le pire scenario
// possible : Stripe encaisse reellement, et la commande reste « en attente de
// paiement » parce que personne ne nous previent. Un paiement qui echoue
// franchement est mille fois preferable.
//
// VERIFIE le 2026-08-24 — chaine prouvee de bout en bout :
//   * la destination a ete CREEE dans Stripe. Il n'y en avait AUCUNE : le rail
//     carte n'avait donc jamais pu fonctionner sur ce compte, et ce n'etait pas
//     une adresse perimee qu'on aurait oublie de corriger ;
//   * signature correcte -> 200, evenement achemine ;
//   * signature falsifiee -> 401 ;
//   * signature valide mais CORPS MODIFIE -> 401, ce qui prouve que la
//     signature couvre le contenu et pas seulement sa presence.
// La cle secrete deployee est bien une cle sk_live_ (deduit du controle
// livemode de la fonction, qui a ignore un evenement marque non-reel).
const CARD_RAIL_ENABLED = true;

export default function CheckoutRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Default to mobile money — the real Guinea rail. Card (Stripe) is hidden
  // (client 2026-07-26: Guinean cards are refused by Stripe).
  const [selected, setSelected] = useState<PaymentMethod>(MOBILE_MONEY_METHOD);
  // Rails qui encaissent SUR un numero guineen : eux seuls ont besoin du champ
  // « numero qui paie ». Soutra Money et la carte Lengopay identifient
  // l'acheteur sur leur propre page — leur reclamer un numero ici bloquerait
  // pour rien un acheteur qui n'en a pas.
  //
  // DOIT RESTER D'ACCORD AVEC LENGOPAY_RAILS[...].needsAccount cote serveur :
  // un rail qui exige un numero la-bas mais ne le demande pas ici donnerait un
  // bouton actif suivi d'un PAYER_PHONE_REQUIRED sans champ pour le corriger.
  const mobileMoneySelected = selected === 'orange-money' || selected === 'mtn-money'
    || selected === 'kulu' || selected === 'paycard';
  // Guinee ou etranger, deduit de l'indicatif du numero principal. Decide quel
  // rail carte proposer : Stripe a l'etranger, Carte/Wallet Lengopay en Guinee.
  const { profile: payProfile, loading: payProfileLoading } = usePaymentProfile();
  // Le numero QUI PAIE — voir src/lib/payerPhone.ts pour le pourquoi (diaspora
  // pilotant un compte OM/MTN guineen depuis l'etranger, client 2026-09-05).
  const payerPhone = usePayerPhone();
  const payerPhoneDigits = payerPhone.digits;
  const payerPhoneValid = payerPhone.valid;
  const payerPhoneE164 = payerPhone.e164;
  // Numero de compte PayCard. Il ne quitte jamais l'appareil autrement que dans
  // l'appel d'initialisation : ni stocke, ni journalise, ni renvoye.
  const [payerCard, setPayerCard] = useState('');
  const payerCardDigits = payerCard.replace(/\D/g, '');
  // « Le bouton Carte bancaire "Stripe" SE TRANSFORME » (client 2026-09-05) :
  // meme emplacement, meme etiquette, rail different selon le profil. Stripe
  // refuse les cartes guineennes (constat client 2026-07-26), donc un profil
  // Guinee part sur lp-card-gn chez Lengopay. Tant que le profil n'est pas
  // charge, aucune des deux : envoyer l'argent sur le mauvais rail est pire
  // qu'attendre une seconde.
  const showStripeCard = CARD_RAIL_ENABLED && !payProfileLoading && payProfile === 'abroad';
  const showLengopayCard = CARD_RAIL_ENABLED && !payProfileLoading && payProfile === 'guinea';
  const showCardRail = showStripeCard || showLengopayCard;
  /** Le moyen que la ligne « Carte bancaire » selectionne, selon le profil. */
  const cardMethod: PaymentMethod = showStripeCard ? 'card' : 'lengopay-card';
  // Kulu et Soutra Money : portefeuilles guineens, aucun sens a l'etranger.
  const showGuineaWallets = !payProfileLoading && payProfile === 'guinea';
  // Client 2026-08-21 : le panier se regle en UNE fois, meme avec plusieurs
  // boutiques. On traite donc TOUJOURS le panier entier. Le parametre shopId
  // n'est plus emis nulle part ; on l'accepte encore pour qu'un lien profond
  // deja ouvert (ancienne version, notification) ne pointe pas dans le vide.
  const { shopId } = useLocalSearchParams<{ shopId?: string }>();
  const allLines = useCart((s) => s.lines);
  const lines = shopId ? allLines.filter((l) => l.shopId === shopId) : allLines;
  const placeOrder = usePlaceOrder();
  const { requireBuyer } = useBuyerGate();
  const cancelPending = useCancelPendingPayment();
  const placeBatch = usePlaceOrdersBatch();
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
  // Meme garde pour les moyens qui dependent du profil (les deux cartes, Soutra
  // Money). Si le profil change pendant que l'ecran est ouvert, la ligne
  // choisie disparait : plus aucun bouton ne parait selectionne, et « Payer »
  // enverrait un moyen que l'ecran n'affiche plus. On retombe sur Orange Money,
  // la seule ligne rendue pour tous les profils. Aucun chemin ne declenche ca
  // aujourd'hui (ouvrir les Reglages demonte cet ecran), mais tout le choix du
  // rail tient desormais a cette seule valeur cote client.
  useEffect(() => {
    if (payProfileLoading) return;
    const gone =
      (selected === 'card' && !showStripeCard) ||
      (selected === 'lengopay-card' && !showLengopayCard) ||
      (selected === 'soutramoney' && !showGuineaWallets) ||
      (selected === 'kulu' && !showGuineaWallets) ||
      (selected === 'paycard' && !showGuineaWallets);
    if (gone) setSelected('orange-money');
  }, [selected, payProfileLoading, showStripeCard, showLengopayCard, showGuineaWallets]);
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
      // Panier multi-boutiques (2026-08-24) : le chemin mono-boutique
      // MULTIPLE_SELLERS-erait des le premier lot a deux vendeurs. isBatch
      // decide la meme porte que pour le mobile money et le portefeuille.
      let orderIdForConfirm: string;
      let payment: { client_secret: string; publishable_key: string } | undefined;
      if (isBatch) {
        const res = await placeBatch.mutateAsync({
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          paymentMethod: 'card',
          deliveryMode,
        });
        const firstOrder = res.orders[0];
        if (!firstOrder) { show(t('checkout.payErrorFallback'), 'danger'); return; }
        orderIdForConfirm = firstOrder.id;
        payment = res.payment;
      } else {
        const res = await placeOrder.mutateAsync({
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          paymentMethod: 'card',
          deliveryMode,
        });
        orderIdForConfirm = res.order.id;
        payment = res.payment;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-router typed-routes regenerate on next `expo start`; route exists on disk.
      const confirmRoute = `/checkout/confirm/${orderIdForConfirm}` as any;
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
      // Client 2026-08-25 : fermer la feuille sans payer envoyait quand meme
      // vers l'ecran « Ta banque confirme… » — un mensonge, puisqu'aucun
      // paiement n'avait ete tente. L'intention restait en plus pendante
      // jusqu'a 15 minutes (le balayage TTL), pour rien. Une annulation
      // EXPLICITE se traite maintenant a part : on l'annule tout de suite
      // cote serveur et on revient au panier, message honnete a l'appui.
      if (payErr && payErr.code === PaymentSheetError.Canceled) {
        try {
          await cancelPending.mutateAsync({ orderId: orderIdForConfirm });
        } catch (e) {
          // Le paiement a pu aboutir entre l'annulation du buyer et cet appel
          // (cancel-pending-payment le detecte et refuse) — rare, mais dans
          // ce cas l'ecran de confirmation reste la bonne destination.
          console.error('[checkout] cancel-pending after sheet cancel failed:', e);
          router.replace(confirmRoute);
          return;
        }
        // On reste sur l'ecran de paiement : fermer le formulaire ne doit rien
        // declencher de plus que ca. router.back() renvoyait au panier, un
        // saut que rien ne demandait.
        show(t('checkout.payCanceled'), 'info');
        return;
      }
      if (payErr) {
        show(payErr.message || 'Paiement échoué', 'danger');
      }
      // Success : webhook flips the order to paid in ~1-3s, the confirmation
      // screen polls until then.
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
  // `!isLoading` ne suffit pas : une requete en ERREUR n'est plus « loading »
  // mais n'a pas de donnee. Le sous-total la comptait alors pour 0 pendant que
  // le serveur, lui, facturait le vrai prix — l'acheteur validait un montant
  // qui n'etait pas celui qu'on lui prenait. On exige donc que CHAQUE article
  // soit charge avant d'autoriser le paiement. Le panier, lui, sait retirer
  // tout seul une ligne dont le produit a ete supprime (404) ; il suffit d'y
  // revenir.
  const allLoaded = queries.every((q) => !q.isLoading && !!q.data);

  // Un article n'a pas pu etre relu (reseau, produit supprime). Plutot qu'un
  // bouton grise sans explication, on renvoie au panier, qui purge tout seul
  // les lignes dont le produit n'existe plus.
  const loadFailed = queries.some((q) => !q.isLoading && !q.data);

  // Nombre de boutiques distinctes. On se fie au produit charge (source
  // serveur) plutot qu'au shopId du panier, qui n'est qu'une copie locale.
  // Tant que les produits chargent, shopCount vaut 0 ou moins que la realite —
  // sans effet, le bouton Payer est de toute facon bloque sur `allLoaded`.
  const shopIds = useMemo(() => {
    const s = new Set<string>();
    for (const q of queries) if (q.data?.shopId) s.add(q.data.shopId);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.data?.shopId ?? '').join(',')]);
  // Un panier mono-boutique continue d'emprunter place-order, le chemin le plus
  // eprouve (sequestre, livraison, QR). Le lot ne sert qu'a ce qu'il apporte
  // vraiment : encaisser une seule fois pour plusieurs vendeurs.
  const isBatch = shopIds.size > 1;

  // La commission est arrondie PAR COMMANDE cote serveur (une commande par
  // boutique). Un 3% applique au sous-total global pourrait s'en ecarter de
  // quelques francs — et process_batch_intent_outcome refuse tout lot dont la
  // somme des commandes ne vaut pas exactement le montant encaisse. On
  // reproduit donc le meme decoupage ici.
  const subtotalByShop = useMemo(() => {
    const m = new Map<string, number>();
    lines.forEach((l, i) => {
      const p = queries[i].data;
      if (!p) return;
      m.set(p.shopId, (m.get(p.shopId) ?? 0) + p.priceGnf * l.quantity);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, queries.map((q) => q.data?.id ?? '').join(',')]);
  const subtotal = lines.reduce((sum, l, i) => {
    const p = queries[i].data;
    return sum + (p?.priceGnf ?? 0) * l.quantity;
  }, 0);
  const serviceFee = isBatch
    ? Array.from(subtotalByShop.values()).reduce((s, sub) => s + platformFeeGnf(sub), 0)
    : platformFeeGnf(subtotal);
  // Ce que l'acheteur voit sur les annonces : prix vendeur + commission.
  // Depuis le 2026-09-08 la commission est COMPRISE dans les prix affiches, donc
  // le recapitulatif doit partir de ce meme montant — sinon la ligne « Total »
  // serait plus haute que la somme des lignes au-dessus, et l'ecart n'aurait
  // aucune explication a l'ecran.
  const articlesWithFee = subtotal + serviceFee;
  // Le frais de livraison DOIT refléter la valeur serveur (delivery.ts) : le
  // serveur recalcule le forfait, ici on montre juste le même montant.
  //
  // Client 2026-08-22 : le forfait s'applique PAR BOUTIQUE — deux boutiques
  // font deux colis, deux livreurs, deux trajets. L'acheteur ne voit qu'un
  // chiffre, mais c'est bien leur somme. shopIds.size vaut 1 pour un panier
  // mono-boutique, donc la formule couvre les deux cas sans branche.
  const shopCount = Math.max(shopIds.size, 1);
  // Depuis 2026-09-03 le tarif depend de la DISTANCE (client : « 1 km = 2000
  // GNF »), calculee a partir de coordonnees et d'une grille qui ne sortent pas
  // du serveur. On demande donc un devis plutot que de multiplier un forfait :
  // sans ça l'ecran afficherait un montant et le serveur en prelverait un
  // autre. Tant que le devis n'a pas repondu — ou quand la geometrie n'est pas
  // fiable — le forfait reste la valeur montree, et c'est aussi celle que le
  // serveur appliquera.
  const deliveryQuote = useDeliveryQuote({
    productIds: lines.map((l) => l.productId),
    deliveryMode,
    addressId: defaultAddress?.id,
    enabled: lines.length > 0,
  });
  // Tant que le devis n'a pas repondu, le montant affiche est le forfait — donc
  // potentiellement PAS celui qui sera preleve. On bloque le bouton jusqu'a ce
  // qu'il ait repondu, exactement comme addressGateLoading bloque tant que la
  // porte adresse n'est pas tranchee. Sans ça, le cache partage des produits
  // rend l'ecran « pret » avant la reponse du devis, et un acheteur rapide
  // validerait 5 000 pendant que le serveur facture la distance.
  const deliveryQuoteLoading = deliveryMode === 'delivery' && !deliveryQuote.isSuccess;
  const deliveryFee = deliveryMode === 'delivery'
    ? (deliveryQuote.data?.total_minor ?? DELIVERY_FEE_GNF * shopCount)
    : 0;
  const total = subtotal + serviceFee + deliveryFee;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('checkout.title')} back />
      {/* CLAVIER : le champ « numero pour le paiement » se retrouvait CACHE
          DERRIERE le clavier (client 2026-09-09, capture a l'appui). Un
          ScrollView ordinaire ne fait rien de particulier quand un champ prend
          le focus : sous adjustResize la fenetre retrecit, mais rien ne
          remonte le champ dans la partie encore visible. On tape a l'aveugle.

          KeyboardAwareScrollView vient de react-native-keyboard-controller,
          deja installe et deja monte a la racine (KeyboardProvider) : c'est le
          meme moteur que les KeyboardAvoidingView de l'onboarding, mais qui
          fait defiler jusqu'au champ focalise au lieu de pousser tout l'ecran.

          `bottomOffset` = la marge gardee SOUS le champ une fois remonte. Ici le bouton « Payer » est
          dans un StickyBottom, colle au bas de la fenetre AU-DESSUS du clavier :
          sans marge, le champ remonterait juste derriere lui. 110 px couvrent sa
          hauteur (contenu + paddings + encoche du bas). */}
      <KeyboardAwareScrollView bottomOffset={110} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        {/* Mode de réception (client 2026-07-30) : livraison Linky ou retrait. */}
        <MicroLabel label="Mode de réception" />
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: needsAddress || deliveryMode === 'delivery' ? 8 : 16 }}>
          {/* Retrait FIRST, livraison second (client 2026-08-07): the address
              card renders right under this list, so putting delivery last
              places it immediately above the address it belongs to. Order is
              presentation only — 'delivery' stays the default selection. */}
          {([
            { mode: 'pickup' as DeliveryMode, icon: 'store' as IconKey, title: 'Retrait sur place', hint: 'Vous récupérez à la boutique — Gratuit' },
            // « trajet groupé » : quand les boutiques sont sur le même chemin, le
            // livreur enchaîne les ramassages et le total est déjà réduit (client
            // 2026-09-05). On le dit, sinon la baisse de prix paraît arbitraire.
            { mode: 'delivery' as DeliveryMode, icon: 'truck' as IconKey, title: 'Livraison à domicile', hint: `Linky vous livre — ${formatGNF(deliveryQuote.data?.total_minor ?? DELIVERY_FEE_GNF * shopCount)}${shopCount > 1 ? (deliveryQuote.data?.grouped ? ` (${shopCount} colis, trajet groupé)` : ` (${shopCount} colis)`) : ''}` },
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

        {/* CARTE — une seule ligne, deux rails. Stripe pour l'etranger,
            Lengopay (lp-card-gn) pour la Guinee. Jusqu'au 2026-09-07 la ligne
            DISPARAISSAIT pour un profil guineen : un acheteur en Guinee n'avait
            aucun moyen de payer par carte, alors que le client demandait que le
            bouton « se transforme ». */}
        {showCardRail && (
          <>
            <MicroLabel label={t('checkout.sectionCard')} />
            <Pressable onPress={() => setSelected(cardMethod)}>
              <Card padding={14} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: '#FFFFFF',
                      overflow: 'hidden',
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Image
                      source={PAY_LOGOS.card}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600' }}>{t('checkout.cardName')}</Text>
                    <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                      {t('checkout.cardHint')}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: selected === cardMethod ? colors.primary : 'transparent',
                      borderWidth: selected === cardMethod ? 0 : 1.5,
                      borderColor: colors.borderStrong,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected === cardMethod && (
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />
                    )}
                  </View>
                </View>
              </Card>
            </Pressable>
          </>
        )}

        {/* Orange et MTN sont deux lignes distinctes depuis Lengopay v2
            (2026-09-05) : l'operateur part avec la requete (type_account), il
            n'y a plus de page hebergee ou l'acheteur le choisirait. */}
        <MicroLabel label={t('checkout.sectionMobileMoney')} />
        <OperatorRow
          logo={MOBILE_MONEY_LOGOS[0]}
          title={t('checkout.rails.orangeMoney')}
          hint={t('checkout.rails.orangeMoneyHint')}
          selected={selected === 'orange-money'}
          onPress={() => setSelected('orange-money')}
        />
        <OperatorRow
          logo={MOBILE_MONEY_LOGOS[1]}
          title={t('checkout.rails.mtnMoney')}
          hint={t('checkout.rails.mtnMoneyHint')}
          selected={selected === 'mtn-money'}
          onPress={() => setSelected('mtn-money')}
        />

        {/* Kulu : portefeuille guineen. Il encaisse SUR un numero, comme Orange
            et MTN, d'ou sa place juste apres eux — au-dessus de la note « entre
            ton numero », qui le decrit aussi. */}
        {showGuineaWallets && (
          <OperatorRow
            logo={PAY_LOGOS.kulu}
            title={t('checkout.rails.kulu')}
            hint={t('checkout.rails.kuluHint')}
            selected={selected === 'kulu'}
            onPress={() => setSelected('kulu')}
          />
        )}

        {/* « entre ton numero, puis confirme la demande » decrit Orange, MTN et
            Kulu — les trois rails a numero. Elle reste donc SOUS eux et AVANT
            Soutra Money : la placer apres en ferait la legende d'un rail qui ne
            demande aucun numero et n'envoie rien sur le telephone. */}
        <Text variant="micro" tone="muted" style={{ marginBottom: 16, paddingHorizontal: 4, letterSpacing: 0, textTransform: 'none', lineHeight: 15 }}>
          {t('checkout.rails.mobileMoneyNote')}
        </Text>

        {/* Soutra Money : portefeuille guineen, l'acheteur finit sur leur page
            (aucun numero a saisir ici). */}
        {showGuineaWallets && (
          <OperatorRow
            logo={PAY_LOGOS.soutraMoney}
            title={t('checkout.rails.soutraMoney')}
            hint={t('checkout.rails.soutraMoneyHint')}
            selected={selected === 'soutramoney'}
            onPress={() => setSelected('soutramoney')}
          />
        )}

        {/* PayCard : carte prepayee guineenne. Sortie ici au meme niveau que
            Kulu et Soutra Money (demande d'Abdoulaye, 2026-09-07) — chez
            Lengopay elle est enterree sous « Wallet » puis un menu deroulant.
            Elle encaisse sur un numero ET un numero de compte, d'ou les deux
            champs ci-dessous. */}
        {showGuineaWallets && (
          <OperatorRow
            logo={PAY_LOGOS.paycard}
            title={t('checkout.rails.paycard')}
            hint={t('checkout.rails.paycardHint')}
            selected={selected === 'paycard'}
            onPress={() => setSelected('paycard')}
          />
        )}

        {/* Numero de compte PayCard. Au-DESSUS du numero de telephone : c'est
            l'information propre a ce rail, le telephone n'en est que le canal
            du code. */}
        {selected === 'paycard' && (
          <View style={{ marginBottom: 16 }}>
            <Input
              label={t('checkout.paycardLabel')}
              leadingIcon="card"
              keyboardType="number-pad"
              placeholder={t('checkout.paycardPlaceholder')}
              value={payerCard}
              onChangeText={setPayerCard}
              helperText={t('checkout.paycardHint')}
            />
          </View>
        )}

        {/* Numero qui paie — toujours affiche pour Orange/MTN, pre-rempli avec
            celui du compte s'il est guineen. Il ne suffit plus d'avoir UN
            numero au compte : la diaspora paie depuis un compte OM/MTN
            guineen qui n'est pas forcement le numero de connexion (client
            2026-09-05), et Lengopay v2 exige un numero local. */}
        {mobileMoneySelected && (
          <View style={{ marginBottom: 16 }}>
            <Input
              // PayCard pose DEUX champs de chiffres l'un sous l'autre. Sans
              // libellé distinct, l'acheteur retape son numéro de carte ici.
              label={selected === 'paycard'
                ? t('checkout.payerPhoneLabelPaycard')
                : t('checkout.payerPhoneLabel')}
              leadingIcon="phone"
              keyboardType="phone-pad"
              placeholder={t('checkout.payerPhonePlaceholder')}
              value={formatGnPhone(payerPhoneDigits)}
              onChangeText={payerPhone.onChange}
              errorText={
                payerPhoneDigits.length > 0 && !payerPhoneValid
                  ? t('checkout.payerPhoneInvalid')
                  : undefined
              }
              helperText={selected === 'paycard'
                ? t('checkout.payerPhoneHintPaycard')
                : (payerPhoneDigits.length === 0 ? t('checkout.payerPhoneHint') : undefined)}
            />
          </View>
        )}

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
                {/* Fond BLANC et non primarySoft : le mark Linky porte deja
                    ses couleurs, une pastille verte derriere les ecraserait. */}
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: '#FFFFFF',
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Image
                    source={PAY_LOGOS.walletLinky}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
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

        {/* « Tu recevras un code SMS » ne vaut QUE pour Kulu. Orange et MTN
            n'envoient AUCUN code : leur demande arrive directement sur le
            telephone, a valider avec le code du portefeuille de l'operateur —
            l'acheteur attendait donc un SMS qui n'arrivait jamais. La carte et
            Soutra Money n'envoient rien non plus. */}
        {selected === 'kulu' && (
          <Card padding={12}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <I.info size={16} color={colors.primary} />
              <Text variant="micro" tone="muted" style={{ flex: 1, lineHeight: 16, letterSpacing: 0, textTransform: 'none' }}>
                {t('checkout.infoMobile')}
              </Text>
            </View>
          </Card>
        )}

        {/* Récapitulatif (client 2026-07-30, étape 1 du parcours) — le client
            voit le détail exact avant de payer. */}
        <MicroLabel label="Récapitulatif" />
        <Card padding={14}>
          {/* La commission n'a JAMAIS sa propre ligne (client 2026-08-22) et,
              depuis le 2026-09-08, elle est comprise dans le montant affiche ici
              comme elle l'est sur les annonces et dans le panier. Les trois
              ecrans montrent donc le meme chiffre pour les memes articles, et
              « Sous-total + Livraison » tombe exactement sur « Total ». */}
          <RecapRow label={`Sous-total (${t('common.feesIncluded').toLowerCase()})`} value={formatGNF(articlesWithFee)} />
          <RecapRow
            label={deliveryMode === 'delivery' ? (shopCount > 1 ? `Livraison (${shopCount} colis)` : 'Livraison') : 'Retrait sur place'}
            value={deliveryMode === 'delivery' ? formatGNF(deliveryFee) : 'Gratuit'}
          />
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700' }}>Total</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatGNF(total)}</Text>
          </View>
        </Card>
      </KeyboardAwareScrollView>

      <StickyBottom>
        <Button
          size="lg"
          block
          loading={placeOrder.isPending || placeBatch.isPending || cardFlowBusy}
          disabled={placeOrder.isPending || placeBatch.isPending || cardFlowBusy || (!allLoaded && !loadFailed) || lines.length === 0 || addressGateLoading || (deliveryQuoteLoading && !loadFailed && !needsAddress) || (mobileMoneySelected && !payerPhoneValid)}
          label={
            placeOrder.isPending || placeBatch.isPending || cardFlowBusy
              ? t('checkout.payingCta')
              : loadFailed
                ? 'Revenir au panier'
                : needsAddress
                  ? 'Ajouter une adresse de livraison'
                  : t('checkout.payCta', { amount: formatGNF(total) })
          }
          onPress={() => {
            // DERNIER FILET avant que l'argent ne parte. Les ecrans amont
            // verrouillent deja, mais celui-ci est atteignable par un lien
            // profond, par un retour arriere, ou apres un changement de role
            // survenu pendant que l'ecran etait ouvert.
            if (!requireBuyer()) return;
            // Livraison sans adresse : on ne prend pas le paiement — on envoie
            // d'abord ajouter une adresse de destination.
            if (loadFailed) {
              router.back();
              return;
            }
            if (needsAddress) {
              router.push('/settings/addresses' as any);
              return;
            }
            const first = lines[0];
            if (!first) return;
            // SEUL 'card' est Stripe. 'lengopay-card' porte le meme libelle a
            // l'ecran mais passe par le rail Lengopay ci-dessous — l'envoyer
            // dans la feuille Stripe ferait refuser la carte guineenne, ce que
            // ce changement existe precisement pour eviter.
            if (selected === 'card') {
              void handleCardOrder();
              return;
            }
            // ── Panier multi-boutiques : un seul encaissement, N commandes ──
            // On navigue avec la PREMIERE commande du lot. Ce n'est pas un
            // raccourci d'affichage : les commandes d'un lot basculent
            // ensemble (process_batch_intent_outcome les traite dans une
            // transaction), donc sonder l'une revient a sonder toutes les
            // autres. L'ecran de confirmation vide le panier entier a la
            // reussite — ce qui est desormais exactement le bon geste.
            if (isBatch) {
              placeBatch.mutate(
                {
                  items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
                  paymentMethod: selected,
                  deliveryMode,
                  ...(payerPhoneE164 ? { payerPhone: payerPhoneE164 } : {}),
                  ...(selected === 'paycard' && payerCardDigits
                    ? { payerCard: payerCardDigits } : {}),
                },
                {
                  onSuccess: (res) => {
                    const firstOrder = res.orders[0];
                    if (!firstOrder) {
                      show(t('checkout.payErrorFallback'), 'danger');
                      return;
                    }
                    if (res.paid) {
                      // Portefeuille : debit et sequestre deja faits, rien ne
                      // peut plus echouer cote acheteur → on vide le panier.
                      useCart.getState().clear();
                      show(t('checkout.orderCreated'), 'success');
                      router.replace(`/checkout/success?orderId=${firstOrder.id}`);
                    } else if (res.next_step?.kind === 'webview') {
                      // Soutra Money / carte Lengopay : l'acheteur finit sur la
                      // page du rail, dans la WebView de l'appli. La fermer
                      // renvoie a l'ecran de confirmation, qui sonde — le
                      // resultat ne depend jamais de ce que la page affichait.
                      router.replace({
                        pathname: '/checkout/pay',
                        params: { url: res.next_step.url, orderId: firstOrder.id },
                      } as any);
                    } else if (res.next_step?.kind === 'otp') {
                      // Kulu. Le lot ne rend pas l'intention, d'ou le payId
                      // porte par l'etape elle-meme.
                      router.replace({
                        pathname: '/checkout/otp',
                        params: { payId: res.next_step.payId, orderId: firstOrder.id },
                      } as any);
                    } else {
                      router.replace(`/checkout/confirm/${firstOrder.id}` as any);
                    }
                  },
                  onError: (err: unknown) => {
                    const msg = (err as { message?: string })?.message ?? t('checkout.payErrorFallback');
                    show(msg, 'danger');
                  },
                },
              );
              return;
            }
            placeOrder.mutate(
              {
                items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
                paymentMethod: selected,
                deliveryMode,
                ...(payerPhoneE164 ? { payerPhone: payerPhoneE164 } : {}),
                  ...(selected === 'paycard' && payerCardDigits
                    ? { payerCard: payerCardDigits } : {}),
              },
              {
                onSuccess: ({ order, intent, next_step }) => {
                  if (intent) {
                    // Phase U.3 — NE PAS vider le panier ici ; le rail peut
                    // encore echouer ou etre annule. Le vidage vit dans la
                    // branche SUCCESS de confirm/[orderId].tsx.
                    if (next_step?.kind === 'webview') {
                      // Soutra Money / carte Lengopay : la page du rail s'ouvre
                      // dans la WebView de l'appli. La fermer mene a l'ecran de
                      // confirmation, qui sonde — l'issue ne depend jamais de ce
                      // que la page affichait.
                      router.replace({
                        pathname: '/checkout/pay',
                        params: { url: next_step.url, orderId: order.id },
                      } as any);
                      return;
                    }
                    if (next_step?.kind === 'otp') {
                      // Kulu : l'acheteur recoit un code par SMS. Sans cet
                      // ecran il n'aurait aucun endroit ou le saisir, et le
                      // paiement expirerait en 15 min.
                      router.replace({
                        pathname: '/checkout/otp',
                        params: { payId: next_step.payId, orderId: order.id },
                      } as any);
                      return;
                    }
                    // Rail Orange/MTN : depuis Lengopay v2 (2026-09-05) le
                    // paiement se declenche cote operateur sans quitter l'appli
                    // — plus de WebView. On va droit a l'ecran de confirmation,
                    // qui sonde jusqu'a ce que le cron bascule l'intention.
                    router.replace(`/checkout/confirm/${order.id}`);
                  } else {
                    // Wallet path (no intent): order already at status='paid'.
                    // Phase U.3 — wallet payment is instant + non-cancellable
                    // from the buyer side, so this is the actual moment of
                    // payment success → safe to clear.
                    // Ne vider QUE la boutique payee : les autres groupes
                    // restent dans le panier pour etre commandes ensuite.
                    if (shopId) useCart.getState().removeShop(shopId);
                    else useCart.getState().clear();
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

// Une ligne opérateur (Orange / MTN). Fond blanc conservé sous le logo : les
// marques des opérateurs sont dessinées pour un fond clair et la flèche Orange
// disparaîtrait sur le thème sombre.
function OperatorRow({
  logo,
  title,
  hint,
  selected,
  onPress,
}: {
  /** Absent pour un rail sans logo fourni (Soutra Money) : on retombe sur
   *  l'icone portefeuille plutot que d'afficher un carre blanc vide. */
  logo?: number;
  title: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress}>
      <Card padding={14} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: logo ? '#FFFFFF' : colors.bgSunken,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {logo
              ? <Image source={logo} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              : <I.wallet size={18} color={colors.text} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600' }}>{title}</Text>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
              {hint}
            </Text>
          </View>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              backgroundColor: selected ? colors.primary : 'transparent',
              borderWidth: selected ? 0 : 1.5,
              borderColor: colors.borderStrong,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
          </View>
        </View>
      </Card>
    </Pressable>
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
