import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../src/theme/ThemeProvider';
import { Text } from '../src/components/primitives/Text';
import { Card } from '../src/components/primitives/Card';
import { useToast } from '../src/components/feedback/Toast';
import { Button } from '../src/components/primitives/Button';
import { TopBar } from '../src/components/nav/TopBar';
import { StickyBottom } from '../src/components/nav/StickyBottom';
import { EmptyState } from '../src/components/feedback/EmptyState';
import { I } from '../src/icons/Icon';
import { formatGNF, formatEUR } from '../src/lib/format';
import { platformFeeGnf, priceWithFeeGnf } from '../src/lib/fees';
import { gnfToEur } from '../src/lib/currency';
import { useCart } from '../src/stores/cart';
import { variantLabel } from '../src/lib/variantsDraft';
import { VariantChoiceSheet } from '../src/components/sheets/VariantChoiceSheet';
import { useBuyerGate } from '../src/components/feedback/BuyerGate';
import { useFilters } from '../src/stores/filters';
import { apiPost } from '../src/lib/api';
import type { Product } from '../src/data/types';
import { haptic } from '../src/lib/haptics';

export default function CartRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const { lines, setQuantity, remove, dropVariant, chooseVariant } = useCart();

  // La ligne dont la combinaison est a refaire. On retient le couple COMPLET :
  // une ligne s'identifie par (article, declinaison), et c'est l'ancienne
  // declinaison qui permet de retrouver EXACTEMENT la ligne a reecrire.
  const [fixing, setFixing] = useState<{ productId: string; variantId?: string } | null>(null);
  const { requireBuyer } = useBuyerGate();

  // One real-backend fetch per cart line; shared cache with useProduct on the
  // detail page (same queryKey shape: ['product', id]).
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

  // Self-heal: 404 PRODUCT_NOT_FOUND ⇒ line points at a deleted product,
  // drop it from the store. Other errors (network, 5xx) are transient and
  // we leave the line alone so the next mount can recover.
  useEffect(() => {
    queries.forEach((q, i) => {
      if (!q.isError) return;
      const status = (q.error as { status?: number })?.status;
      const code = (q.error as { code?: string })?.code;
      if (status === 404 || code === 'PRODUCT_NOT_FOUND') {
        remove(lines[i].productId, lines[i].variantId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.status).join(',')]);

  // ┌─ LA LIGNE DESIGNE-T-ELLE ENCORE UNE COMBINAISON VALABLE ? ─────────────┐
  // Deux cas la cassent, et aucun n'est la faute de l'acheteur :
  //   — la ligne a ete enregistree AVANT ce lot (pas de variantId), et l'annonce
  //     a depuis gagne des tailles ;
  //   — le vendeur a retire la combinaison choisie.
  // Dans les deux cas place_order refuserait (VARIANT_REQUIRED / VARIANT_GONE)
  // apres le choix du moyen de paiement. On le dit donc ICI, ou le choix se
  // refait en deux touchers, et on bloque le bouton plutot que le paiement.
  // └───────────────────────────────────────────────────────────────────────┘
  const lineVariant = (line: (typeof lines)[number], product: Product) =>
    line.variantId ? (product.variants ?? []).find((v) => v.id === line.variantId) : undefined;
  const needsChoice = (line: (typeof lines)[number], product: Product) =>
    product.hasVariants === true && !lineVariant(line, product);

  // LE SENS INVERSE, QUI N'ETAIT PAS COUVERT : la ligne PORTE une declinaison
  // alors que l'annonce n'en a plus (le vendeur est repasse en article simple).
  // Le serveur refuse alors VARIANT_UNEXPECTED et tue TOUT le lot — pour un
  // article que rien a l'ecran ne signalait. Comme l'annonce n'a plus de
  // declinaison, une ligne simple est exactement ce qu'il faut : on repare,
  // on ne demande rien.
  const staleVariant = (line: (typeof lines)[number], product: Product) =>
    product.hasVariants !== true && !!line.variantId;

  // Repare les lignes devenues incoherentes des que les annonces sont relues.
  // Silencieux et idempotent : dropVariant ne fait rien s'il n'y a rien a
  // reparer, donc l'effet ne peut pas boucler.
  useEffect(() => {
    queries.forEach((q, i) => {
      const p = q.data;
      const l = lines[i];
      if (!p || !l) return;
      if (staleVariant(l, p)) dropVariant(l.productId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => `${q.data?.id ?? ''}:${q.data?.hasVariants ?? ''}`).join(',')]);

  const allLoaded = queries.every((q) => !q.isLoading);
  const items = lines
    .map((l, i) => ({ line: l, product: queries[i].data }))
    .filter((x): x is { line: typeof lines[0]; product: Product } => !!x.product);
  // Regroupement par boutique (client 2026-08-13 : « l'ajout d'articles de
  // boutiques differentes n'est pas actif »). Le panier en accepte desormais
  // plusieurs. Chaque groupe reste UNE commande cote serveur — un sequestre, un
  // vendeur, une livraison, un QR — mais depuis le 2026-08-21 le paiement est
  // unique : place_orders_batch cree les N commandes dans une transaction et un
  // seul encaissement les couvre toutes. Le regroupement ne sert donc plus qu'a
  // l'affichage et au calcul de la commission, arrondie commande par commande.
  const groups = useMemo(() => {
    const byShop = new Map<string, typeof items>();
    for (const it of items) {
      const k = it.product.shopId;
      const list = byShop.get(k);
      if (list) list.push(it);
      else byShop.set(k, [it]);
    }
    return Array.from(byShop.entries()).map(([shopId, groupItems]) => {
      const sub = groupItems.reduce((s, { line, product }) => s + product.priceGnf * line.quantity, 0);
      const f = platformFeeGnf(sub);
      return { shopId, items: groupItems, subtotal: sub, fees: f, total: sub + f };
    });
  }, [items]);

  // Total GLOBAL = somme des totaux par boutique, PAS un 3% recalcule sur le
  // sous-total global. C'est important : le serveur cree une commande par
  // boutique et arrondit la commission commande par commande. Additionner les
  // totaux deja arrondis donne exactement le montant que le serveur encaissera ;
  // un arrondi global pourrait en differer de quelques francs, et
  // process_batch_intent_outcome refuse tout lot dont la somme ne colle pas.
  const grandSubtotal = groups.reduce((s, g) => s + g.subtotal, 0);
  const grandFees = groups.reduce((s, g) => s + g.fees, 0);
  const grandTotal = grandSubtotal + grandFees;

  // Noms de boutique — meme cle de cache que useShop, donc aucun appel en double
  // si l'utilisateur a deja ouvert la boutique.
  const shopQueries = useQueries({
    queries: groups.map((g) => ({
      queryKey: ['shop', g.shopId],
      queryFn: async () => {
        const { shop } = await apiPost<{ shop: { id: string; name: string } }>({
          path: '/get-shop', authed: false, body: { id: g.shopId },
        });
        return shop;
      },
      staleTime: 5 * 60_000,
    })),
  });

  if (!allLoaded && lines.length > 0) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('cart.title')} back />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="bodyM" tone="muted">{t('cart.syncing')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (items.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('cart.title')} back />
        <EmptyState
          icon="cart"
          title={t('cart.emptyTitle')}
          description={t('cart.emptySub')}
          ctaLabel={t('cart.emptyCta')}
          onCta={() => {
            // Cart is products-only → make sure Marché opens on Articles and
            // not on whatever tab the user last browsed.
            useFilters.getState().setMarcheTab('articles');
            router.push('/(tabs)/marche');
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title={t('cart.title')}
        back
        subtitle={t('cart.subtitle', {
          itemsLabel: t('cart.article', { count: items.length }),
          sellersLabel: t('cart.seller', { count: groups.length }),
        })}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 10 }}>
        {/* Plus de bandeau « chaque boutique se paie separement » : depuis le
            2026-08-21 le panier se regle en UNE fois. Ce qui reste vrai — une
            livraison et un code de retrait par boutique — est dit dans le
            recapitulatif, la ou l'acheteur regarde le montant. */}
        {groups.map((group, gi) => (
        <View key={group.shopId} style={{ gap: 10 }}>
          {/* En-tete de boutique. Il n'apparait que s'il y a plusieurs groupes :
              avec une seule boutique il n'apporte rien et ajoute du bruit. */}
          {groups.length > 1 && (
            <Pressable
              onPress={() => {
                haptic.light();
                router.push(`/shop/${group.shopId}`);
              }}
              hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
            >
              <I.store size={14} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', letterSpacing: 0 }} numberOfLines={1}>
                {shopQueries[gi]?.data?.name ?? 'Boutique'}
              </Text>
              <I.chevronR size={14} color={colors.textMuted} />
            </Pressable>
          )}
        {group.items.map(({ line, product }) => (
          <Card key={`${product.id}:${line.variantId ?? ''}`} padding={10}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Image
                source={product.photos[0]}
                style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: colors.bgSunken }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', lineHeight: 17 }} numberOfLines={2}>
                  {product.title}
                </Text>
                {/* La combinaison choisie. On prefere le libelle VIVANT a celui
                    fige a l'ajout : si le vendeur a renomme sa couleur, c'est
                    son nom actuel qui compte. */}
                {(() => {
                  const v = lineVariant(line, product);
                  if (needsChoice(line, product)) {
                    return (
                      <Pressable
                        onPress={() => {
                          haptic.light();
                          // ON NE RENVOIE PLUS SUR LA FICHE : y ajouter la
                          // bonne taille creait une ligne SOEUR et laissait la
                          // morte en place. La ligne cassee est ici, on la
                          // repare ici.
                          setFixing({ productId: product.id, variantId: line.variantId });
                        }}
                        hitSlop={6}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}
                        accessibilityRole="button"
                      >
                        <Text variant="micro" tone="danger" style={{ letterSpacing: 0, textTransform: 'none' }}>
                          {t('create.variantsChoiceRequired')}
                        </Text>
                        <Text variant="micro" tone="primary" style={{ letterSpacing: 0, textTransform: 'none', fontWeight: '700' }}>
                          {t('create.variantsPickShort')}
                        </Text>
                        <I.chevronR size={11} color={colors.primary} />
                      </Pressable>
                    );
                  }
                  const label = v ? variantLabel(v) : line.variantLabel;
                  return label ? (
                    <Text variant="micro" tone="muted" style={{ marginTop: 3, letterSpacing: 0, textTransform: 'none' }}>
                      {label}
                    </Text>
                  ) : null;
                })()}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <Text style={{ fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] }}>
                    {/* Prix ACHETEUR (client 2026-09-08). */}
                    {formatGNF(priceWithFeeGnf(product.priceGnf))}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.bgSunken,
                      borderRadius: 999,
                      padding: 3,
                      gap: 2,
                    }}
                  >
                    {/* Decrement / delete — now a VISIBLE circle like the +
                        (client 2026-08-03 : the bare « − » was hard to see). At
                        qty 1 it becomes a trash icon to remove the line. */}
                    <Pressable
                      onPress={() => {
                        haptic.light();
                        if (line.quantity === 1) remove(product.id, line.variantId);
                        else setQuantity(product.id, line.quantity - 1, line.variantId);
                      }}
                      hitSlop={6}
                      style={{
                        width: 30,
                        height: 30,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.card,
                        borderRadius: 999,
                      }}
                    >
                      {line.quantity === 1 ? (
                        <I.trash size={15} color={colors.text} />
                      ) : (
                        <I.minus size={15} color={colors.text} />
                      )}
                    </Pressable>
                    <Text style={{ minWidth: 24, textAlign: 'center', fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] }}>
                      {line.quantity}
                    </Text>
                    {/* Plafond = quantité déclarée par le vendeur. `stock` null
                        signifie « non renseignée » (annonces publiées avant le
                        stock) et ne plafonne rien. Ce blocage est du confort :
                        la vérité est dans place_order_multi, qui verrouille la
                        ligne produit et refuse le dépassement même si le panier
                        a été trafiqué. */}
                    <Pressable
                      onPress={() => {
                        // Le plafond d'une ligne a declinaison est la quantite de
                        // SA combinaison : il reste peut-etre huit paires, mais
                        // une seule en 44 noire. Le total de l'annonce ne dit rien
                        // de ce que l'acheteur peut encore prendre.
                        const cap = lineVariant(line, product)?.stock ?? product.stock;
                        if (cap != null && line.quantity >= cap) {
                          haptic.light();
                          toast.show(t('cart.stockMax', { count: cap }), 'info');
                          return;
                        }
                        haptic.light();
                        setQuantity(product.id, line.quantity + 1, line.variantId);
                      }}
                      hitSlop={6}
                      style={{
                        width: 30,
                        height: 30,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: (() => {
                          const cap = lineVariant(line, product)?.stock ?? product.stock;
                          return cap != null && line.quantity >= cap ? colors.borderStrong : colors.primary;
                        })(),
                        borderRadius: 999,
                      }}
                    >
                      <I.plus size={15} color="#FFFFFF" />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </Card>
        ))}

        </View>
        ))}

        {/* Recapitulatif GLOBAL. Client 2026-08-21 : un seul total, une seule
            validation, meme avec plusieurs boutiques. Les totaux par boutique
            ont disparu — ils poussaient a payer en plusieurs fois.
            Ces montants sont indicatifs : le serveur recalcule tout depuis les
            prix en base, et c'est SA valeur qui est encaissee. */}
        <Card padding={14} style={{ marginTop: 4 }}>
          {/* Ligne « Sous-total » RETIREE le 2026-09-08. La commission est
              desormais comprise dans les prix affiches (client : « integrer
              directement au prix des annonces »), donc le sous-total valait
              exactement le total : deux lignes identiques, dont l'une semblait
              annoncer un supplement a venir. Le panier ne porte aucune autre
              ligne — la livraison se choisit a l'ecran suivant — donc un seul
              montant suffit, et il est juste.
              La commission reste prelevee et le serveur en reste seul maitre ;
              on ne la detaille simplement plus (deja le cas depuis 2026-08-22). */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 13, fontWeight: '600' }}>{t('cart.total')}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontWeight: '700', fontSize: 18, fontVariant: ['tabular-nums'] }}>
                {formatGNF(grandTotal)}
              </Text>
              <Text variant="micro" tone="muted" style={{ letterSpacing: 0 }}>
                {formatEUR(gnfToEur(grandTotal))}
              </Text>
            </View>
          </View>
          {groups.length > 1 && (
            <Text variant="caption" tone="muted" style={{ marginTop: 10, letterSpacing: 0, lineHeight: 16 }}>
              {t('cart.singlePaymentNote', { n: groups.length })}
            </Text>
          )}
        </Card>
      </ScrollView>

      {/* Un seul bouton pour tout le panier (client 2026-08-21). */}
      <StickyBottom>
        <Button
          size="lg"
          block
          label={`${t('cart.pay')} · ${formatGNF(grandTotal)}`}
          onPress={() => {
            // Le panier peut avoir ete rempli AVANT que le compte ne perde son
            // role acheteur : ses articles restent, mais le paiement s'arrete
            // ici plutot qu'a l'ecran suivant.
            if (!requireBuyer()) return;
            // Une ligne sans combinaison valable ferait echouer TOUT le lot
            // (place_orders_batch est transactionnel) : l'acheteur perdrait son
            // paiement en cours pour un article qu'il n'a meme pas vu signale.
            const broken = items.find(({ line, product }) => needsChoice(line, product));
            if (broken) {
              haptic.light();
              // On OUVRE le choix au lieu de se contenter de le reclamer : un
              // avertissement qui nomme l'article laisse encore l'acheteur
              // chercher ou reparer. S'il y en a plusieurs, chaque appui sur
              // « Payer » presente la suivante.
              setFixing({ productId: broken.product.id, variantId: broken.line.variantId });
              return;
            }
            // ┌─ UN DON SE PREND SEUL ────────────────────────────────────────┐
            // Le serveur le refuse desormais des deux cotes (GIFT_ALONE en
            // mono-boutique ET en lot), mais se faire refuser APRES avoir choisi
            // son moyen de paiement, sans savoir quel article pose probleme, est
            // une impasse : le panier n'est pas vide, donc la tentative suivante
            // echoue a l'identique.
            //
            // On le dit donc ici, en NOMMANT le don. Le melange partait
            // jusqu'ici au paiement sans un mot et facturait 15 000 GNF de
            // livraison pour un objet gratuit.
            // └──────────────────────────────────────────────────────────────┘
            const gift = items.find(({ product }) => product.isGift === true);
            if (gift && items.length > 1) {
              haptic.light();
              toast.show(
                t('cart.giftAlone', { titre: gift.product.title }),
                'info',
              );
              return;
            }
            haptic.light();
            router.push('/checkout');
          }}
        />
      </StickyBottom>

      <VariantChoiceSheet
        product={fixing ? (items.find(({ product }) => product.id === fixing.productId)?.product ?? null) : null}
        onClose={() => setFixing(null)}
        onPick={(variant) => {
          if (!fixing) return;
          chooseVariant(fixing.productId, fixing.variantId, variant);
          setFixing(null);
        }}
      />
    </SafeAreaView>
  );
}
