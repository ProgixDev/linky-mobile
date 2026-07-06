import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from './Text';
import type { ReactNode } from 'react';
import { haptic } from '../../lib/haptics';

export type ChipVariant = 'default' | 'soft' | 'saffron' | 'danger' | 'info' | 'inverse';

export interface ChipProps {
  label: string;
  active?: boolean;
  variant?: ChipVariant;
  onPress?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, active, variant = 'default', onPress, leading, trailing, block, style }: ChipProps) {
  const { colors } = useTheme();
  let bg = colors.card;
  let fg = colors.text;
  let border: string = colors.border;
  if (active) {
    bg = colors.text;
    fg = colors.bg;
    border = colors.text;
  } else if (variant === 'soft') {
    bg = colors.primarySoft;
    fg = colors.primary;
    border = colors.primarySoft;
  } else if (variant === 'saffron') {
    bg = colors.accentSoft;
    fg = colors.accentText;
    border = colors.accentSoft;
  } else if (variant === 'danger') {
    bg = 'rgba(209, 79, 60, 0.12)';
    fg = colors.danger;
    border = 'rgba(209, 79, 60, 0.12)';
  } else if (variant === 'info') {
    bg = 'rgba(58, 124, 168, 0.12)';
    fg = colors.info;
    border = 'rgba(58, 124, 168, 0.12)';
  } else if (variant === 'inverse') {
    bg = 'rgba(255,255,255,0.95)';
    fg = colors.text;
    border = 'rgba(255,255,255,0.95)';
  }
  const inner = (
    <View
      style={{
        paddingHorizontal: 14,
        height: 36,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: block ? 'stretch' : 'flex-start',
        justifyContent: block ? 'center' : 'flex-start',
      }}
    >
      {leading}
      <Text
        // Same fit treatment as Button: block chips in tight rows (e.g. 4
        // condition chips incl. « Reconditionné ») auto-scale instead of
        // clipping against the pill border.
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{
          flexShrink: 1,
          color: fg,
          fontSize: 13,
          fontWeight: '600',
          lineHeight: 16,
          letterSpacing: 0,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
      {trailing}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      hitSlop={4}
      style={[block && { flex: 1 }, style]}
    >
      {inner}
    </Pressable>
  );
}
