import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Avatar } from '../primitives/Avatar';
import { I } from '../../icons/Icon';
import type { Shop } from '../../data/types';

export function ShopMiniCard({ shop, width = 140 }: { shop: Shop; width?: number }) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      onPress={() => router.push(`/shop/${shop.id}`)}
      style={{
        width,
        padding: 12,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.lg,
        alignItems: 'center',
        gap: 6,
      }}
      accessibilityRole="button"
      accessibilityLabel={`Boutique ${shop.name}`}
    >
      <Avatar source={shop.avatar} size="lg" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }} numberOfLines={1}>
          {shop.name}
        </Text>
        {shop.verified && <I.check size={11} color={colors.accent} stroke={2.5} />}
      </View>
      <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
        {shop.productCount} {shop.productCount === 1 ? 'article' : 'articles'}
        {shop.reviewCount > 0 ? ` · ★ ${shop.rating.toFixed(1)}` : ' · Nouveau'}
      </Text>
    </Pressable>
  );
}
