// Shared header actions — favoris / notifications / panier. Rendered on the
// Accueil (home) AND Marché (annonces) screens so the three buttons are
// identical everywhere (client 2026-07-26: favoris moved off Profil, and the
// trio must be consistent across Accueil and Annonces).
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Heart, Bell, ShoppingBag } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';
import { useCart } from '../../stores/cart';
import { useUnreadNotificationsCount } from '../../data/queries';

function ActionButton({
  onPress,
  children,
  badge,
  accessibilityLabel,
}: {
  onPress: () => void;
  children: React.ReactNode;
  badge?: 'dot' | string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: 42,
        height: 42,
        borderRadius: 999,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
      {badge === 'dot' ? (
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 9,
            height: 9,
            borderRadius: 999,
            backgroundColor: colors.danger,
            borderWidth: 2,
            borderColor: colors.card,
          }}
        />
      ) : typeof badge === 'string' ? (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            borderRadius: 999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: colors.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700', lineHeight: 11, includeFontPadding: false }}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function HeaderActions() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const cartCount = useCart((s) => s.lines.length);
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <ActionButton onPress={() => router.push('/favorites')} accessibilityLabel={t('home.favorites')}>
        <Heart size={18} color={colors.text} strokeWidth={1.75} />
      </ActionButton>
      <ActionButton
        onPress={() => router.push('/notifications')}
        accessibilityLabel={t('home.notifications')}
        badge={unreadCount > 0 ? 'dot' : undefined}
      >
        <Bell size={18} color={colors.text} strokeWidth={1.75} />
      </ActionButton>
      <ActionButton
        onPress={() => router.push('/cart')}
        accessibilityLabel={t('home.cart', { count: cartCount })}
        badge={cartCount > 0 ? String(cartCount) : undefined}
      >
        <ShoppingBag size={18} color={colors.text} strokeWidth={1.75} />
      </ActionButton>
    </View>
  );
}
