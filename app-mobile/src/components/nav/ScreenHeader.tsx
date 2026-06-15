import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';

export function ScreenHeader({
  title,
  subtitle,
  trailing,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  showBack?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 }}>
      {showBack && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Pressable
            onPress={() => {
              haptic.light();
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)');
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel={t('a11y.back')}
          >
            <ArrowLeft size={18} color={colors.text} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {trailing}
        </View>
      )}
      <Text
        style={{
          fontSize: 28,
          fontWeight: '700',
          color: colors.text,
          letterSpacing: -0.4,
          lineHeight: 34,
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontSize: 14,
            color: colors.textMuted,
            marginTop: 4,
            letterSpacing: 0,
            lineHeight: 20,
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}
