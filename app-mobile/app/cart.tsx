import { useEffect, useMemo } from 'react';
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
import { gnfToEur } from '../src/lib/currency';
import { useCart } from '../src/stores/cart';
import { useFilters } from '../src/stores/filters';
import { apiPost } from '../src/lib/api';
import type { Product } from '../src/data/types';
import { haptic } from '../src/lib/haptics';

export default function CartRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const { lines, setQuantity, remove } = useCart();

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
        remove(lines[i].productId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.status).join(',')]);

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
      const f = Math.round(sub * 0.03);
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
          <Card key={product.id} padding={10}>
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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <Text style={{ fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] }}>
                    {formatGNF(product.priceGnf)}
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
                        if (line.quantity === 1) remove(product.id);
                        else setQuantity(product.id, line.quantity - 1);
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
                        if (product.stock != null && line.quantity >= product.stock) {
                          haptic.light();
                          toast.show(
                            t('cart.stockMax', { count: product.stock }),
                            'info',
                          );
                          return;
                        }
                        haptic.light();
                        setQuantity(product.id, line.quantity + 1);
                      }}
                      hitSlop={6}
                      style={{
                        width: 30,
                        height: 30,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor:
                          product.stock != null && line.quantity >= product.stock
                            ? colors.borderStrong
                            : colors.primary,
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text variant="caption" tone="muted" style={{ letterSpacing: 0 }}>
              {t('cart.subtotal')}
            </Text>
            <Text style={{ fontVariant: ['tabular-nums'] }}>{formatGNF(grandSubtotal)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text variant="caption" tone="muted" style={{ letterSpacing: 0 }}>
              {t('cart.feesLabel')} <Text style={{ color: colors.primary }}>(3%)</Text>
            </Text>
            <Text style={{ fontVariant: ['tabular-nums'] }}>{formatGNF(grandFees)}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
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
              Un seul paiement pour {groups.length} boutiques. Chacune prépare et livre sa
              commande de son côté, avec son propre code de retrait.
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
            haptic.light();
            router.push('/checkout');
          }}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
