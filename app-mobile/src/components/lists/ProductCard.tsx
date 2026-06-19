import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Badge } from '../primitives/Badge';
import { I } from '../../icons/Icon';
import { formatGNF } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useFavorites } from '../../stores/favorites';
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
  const isFav = useFavorites((s) => s.productIds.has(product.id));
  const toggleFav = useFavorites((s) => s.toggleProduct);
  const sold = product.status === 'sold';
  const imgProps = useDataSaverImageProps();

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
            <I.heart size={15} color={colors.text} />
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
      </View>
      <View>
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
        {!compact && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Text variant="micro" tone="muted" numberOfLines={1} style={{ textTransform: 'none', letterSpacing: 0 }}>
              {product.shopId.replace('s_', '').replace(/_/g, ' ')}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
