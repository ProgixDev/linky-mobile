import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { router, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { IconButton } from '../primitives/Button';
import { I } from '../../icons/Icon';

export interface TopBarProps {
  title?: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  dark?: boolean;
  transparent?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TopBar({
  title,
  subtitle,
  back,
  onBack,
  right,
  dark,
  transparent,
  style,
}: TopBarProps) {
  const { colors } = useTheme();
  const r = useRouter();
  const { t } = useTranslation();
  return (
    <View
      style={[
        {
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: transparent ? 'transparent' : dark ? colors.discoverBg : colors.bg,
        },
        style,
      ]}
    >
      {back && (
        <IconButton
          variant={dark ? 'glass' : 'secondary'}
          size={36}
          accessibilityLabel={t('a11y.back')}
          onPress={() => {
            if (onBack) onBack();
            else if (r.canGoBack()) router.back();
          }}
        >
          <I.arrowLeft size={18} color={dark ? '#FFFFFF' : colors.text} />
        </IconButton>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <Text variant="titleL" style={{ fontSize: 18, color: dark ? '#FFFFFF' : colors.text }}>
            {title}
          </Text>
        )}
        {subtitle && (
          <Text variant="caption" tone={dark ? 'inverse' : 'muted'} style={dark ? { opacity: 0.6 } : undefined}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}
