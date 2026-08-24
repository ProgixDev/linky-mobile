import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Badge } from '../primitives/Badge';
import { I } from '../../icons/Icon';
import { formatGNF } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useFavorites } from '../../stores/favorites';
import { useCart } from '../../stores/cart';
import { useToast } from '../feedback/Toast';
import { useDataSaverImageProps } from '../../lib/dataSaver';
import type { Product } from '../../data/types';

export function ProductCard({
  product,
  compact,
}: {
  product: Product;
  compact?: boolean;
}) {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const isFav = useFavorites((s) => s.productIds.has(product.id));
  const toggleFav = useFavorites((s) => s.toggleProduct);
  const sold = product.status === 'sold';
  const imgProps = useDataSaverImageProps();
  const addToCart = useCart((s) => s.add);
  const toast = useToast();
  const outOfStock = product.stock != null && product.stock <= 0;

  /** Ajout rapide depuis la liste (client 2026-08-13). Le panier accepte
   *  desormais plusieurs boutiques : plus aucun refus ici, le regroupement et le
   *  paiement boutique par boutique se font a l'ecran du panier. */
  const onQuickAdd = () => {
    haptic.light();
    if (outOfStock) {
      toast.show(t('product.outOfStockToast'), 'info');
      return;
    }
    addToCart(product.id, product.shopId);
    toast.show('Ajouté au panier', 'success');
  };

  return (
    <Pressable
      onPress={() => router.push(`/product/${product.id}`)}
      style={{ gap: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, ${formatGNF(product.priceGnf)}`}
    >
      <View style={{ position: 'relative', aspectRatio: 1, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.bgSunken }}>
        <Image
          source={product.photos[0]}
          contentFit="cover"
          style={{ flex: 1 }}
          transition={imgProps.transition}
          priority={imgProps.priority}
          recyclingKey={product.id}
        />
        <Pressable
          onPress={() => {
            haptic.light();
            toggleFav(product.id);
          }}
          hitSlop={8}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 30,
            height: 30,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityLabel={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          {isFav ? (
            <I.heartFill size={15} color={colors.danger} />
          ) : (
            // Fixed dark, NOT colors.text — the circle is always white
            // (rgba 255,255,255,.92), so colors.text would be invisible in dark mode.
            <I.heart size={15} color="#2E2E2E" />
          )}
        </Pressable>
        {product.boosted && (
          <View style={{ position: 'absolute', top: 8, left: 8 }}>
            <Badge tone="boost" />
          </View>
        )}
        {!product.boosted && product.condition && (
          <View style={{ position: 'absolute', bottom: 8, left: 8 }}>
            <Badge
              tone="condition"
              label={product.condition === 'neuf' ? 'Neuf' : product.condition === 'occasion' ? 'Occasion' : 'Reconditionné'}
            />
          </View>
        )}
        {product.favCount > 0 && !sold && (
          <View
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 7,
              height: 22,
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.55)',
            }}
          >
            <I.heartFill size={10} color="#FFFFFF" />
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] }}>
              {product.favCount}
            </Text>
          </View>
        )}
        {sold && (
          <View
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', letterSpacing: 1, fontSize: 18 }}>
              VENDU
            </Text>
          </View>
        )}
        {/* Rupture de stock : le vendeur a declare une quantite, elle est
            epuisee. Sans ce voile, l'annonce paraissait achetable et l'acheteur
            ne l'apprenait qu'au refus du serveur, apres avoir choisi son mode de
            paiement. Distinct de VENDU, qui est un statut pose a la main par le
            vendeur — ici l'article peut revenir des qu'il reapprovisionne. */}
        {!sold && outOfStock && (
          <>
            {/* Voile sombre pour eteindre la photo, ET une etiquette ROUGE
                (client 2026-08-24). Le voile seul se confondait avec une image
                sombre ; le rouge dit sans ambiguite que l'article n'est pas
                achetable. Distinct de VENDU, statut pose a la main par le
                vendeur — ici l'article revient des qu'il reapprovisionne. */}
            <View
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.45)',
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                paddingHorizontal: 8,
                height: 22,
                borderRadius: 6,
                backgroundColor: colors.danger,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 10, letterSpacing: 0.4 }}>
                {t('product.outOfStockBadge')}
              </Text>
            </View>
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        {/* minWidth 0 : sans lui, un titre long refuse de se tronquer et pousse
            le bouton hors de la carte. */}
        <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 13,
            fontWeight: '500',
            lineHeight: 17,
            color: sold ? colors.textMuted : colors.text,
            textDecorationLine: sold ? 'line-through' : 'none',
          }}
        >
          {product.title}
        </Text>
        <Text style={{ fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'], marginTop: 2 }}>
          {formatGNF(product.priceGnf)}
        </Text>
        {/* Location line. Pre-fix this rendered product.shopId — a mock-era
            leftover ('s_mamadou_shop') that shows a raw UUID with real data. */}
        {!compact && (product.district || product.city) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Text variant="micro" tone="muted" numberOfLines={1} style={{ textTransform: 'none', letterSpacing: 0 }}>
              {[product.district, product.city].filter(Boolean).join(', ')}
            </Text>
          </View>
        ) : null}
        </View>

        {/* Ajout rapide au panier. Masque sur la rangee compacte de l'accueil
            (cartes de 260 px : la place manque) et sur un article vendu. */}
        {!compact && !sold && (
          <Pressable
            onPress={onQuickAdd}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Ajouter ${product.title} au panier`}
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: outOfStock ? colors.bgSunken : colors.primary,
              marginTop: 2,
            }}
          >
            <I.cart size={16} color={outOfStock ? colors.textFaint : '#FFFFFF'} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}
