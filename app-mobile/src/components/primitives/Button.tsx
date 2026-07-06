import {
  ActivityIndicator,
  Pressable,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { haptic } from '../../lib/haptics';
import { Text } from './Text';
import type { ReactNode } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'saffron'
  | 'dark'
  | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'compact';

export interface ButtonProps {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  hapticOnPress?: boolean;
  children?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 44, compact: 42, lg: 56 };
const PADX: Record<ButtonSize, number> = { sm: 14, md: 18, compact: 18, lg: 24 };
const FONTS: Record<ButtonSize, number> = { sm: 13, md: 14, compact: 13.5, lg: 16 };

interface Palette {
  bg: string;
  fg: string;
  border: string;
  borderWidth: number;
}

function getPalette(
  variant: ButtonVariant,
  colors: ReturnType<typeof useTheme>['colors'],
): Palette {
  switch (variant) {
    case 'primary':
      return { bg: colors.primary, fg: '#FFFFFF', border: 'transparent', borderWidth: 0 };
    case 'secondary':
      return { bg: colors.bgElev, fg: colors.text, border: colors.borderStrong, borderWidth: 1 };
    case 'ghost':
      return { bg: 'transparent', fg: colors.text, border: 'transparent', borderWidth: 0 };
    case 'destructive':
      return { bg: colors.danger, fg: '#FFFFFF', border: 'transparent', borderWidth: 0 };
    case 'saffron':
      return { bg: colors.accent, fg: '#2A1A05', border: 'transparent', borderWidth: 0 };
    case 'dark':
      return { bg: '#0E1311', fg: '#FFFFFF', border: 'transparent', borderWidth: 0 };
    case 'outline':
      return { bg: 'transparent', fg: colors.text, border: colors.borderStrong, borderWidth: 1.5 };
  }
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  onPress,
  disabled,
  loading,
  leading,
  trailing,
  block,
  style,
  hapticOnPress = true,
  children,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const palette = getPalette(variant, colors);

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Inner pressable always fills its wrapper. Block / external flex / width
  // is controlled on the wrapper below.
  const containerStyle: ViewStyle = {
    height: HEIGHTS[size],
    paddingHorizontal: PADX[size],
    borderRadius: 999,
    backgroundColor: palette.bg,
    borderWidth: palette.borderWidth,
    borderColor: palette.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    opacity: disabled ? 0.45 : 1,
    alignSelf: 'stretch',
    width: '100%',
  };

  return (
    <Animated.View
      style={[
        animatedStyle,
        // Default size = content. Block stretches to parent width. External
        // style (flex / width) takes precedence over both.
        block ? { alignSelf: 'stretch', width: '100%' } : { alignSelf: 'flex-start' },
        style,
      ]}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withTiming(0.97, { duration: 80 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 120 });
        }}
        onPress={(e) => {
          if (disabled || loading) return;
          if (hapticOnPress) haptic.light();
          onPress?.(e);
        }}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !!disabled }}
        testID={testID}
        style={containerStyle}
      >
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : (
          <>
            {leading}
            {label && (
              <Text
                // Long French labels in flex-constrained rows used to wrap and
                // get clipped by the fixed-height pill. One line + ellipsis.
                // NO adjustsFontSizeToFit : on Android it measures the full
                // available width and draws the glyphs off-center (labels
                // rendered pushed right on auto-width buttons).
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  textAlign: 'center',
                  color: palette.fg,
                  fontSize: FONTS[size],
                  fontWeight: size === 'lg' ? '700' : '600',
                  letterSpacing: 0.1,
                }}
              >
                {label}
              </Text>
            )}
            {children}
            {trailing}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function IconButton({
  onPress,
  children,
  variant = 'secondary',
  size = 44,
  // Phase U.0 — pass-through hitSlop so 36px icon buttons can grow their
  // touch target (Chip already follows this default). MessagesListScreen
  // search toggle uses 6 ; sub-44px primary actions should set hitSlop
  // to bring the effective target to ≥44px.
  hitSlop = 4,
  disabled,
  accessibilityLabel,
  style,
}: {
  onPress?: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'glass';
  size?: number;
  hitSlop?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'secondary'
        ? colors.bgElev
        : variant === 'glass'
          ? 'rgba(255,255,255,0.15)'
          : 'transparent';
  const border =
    variant === 'secondary'
      ? colors.border
      : variant === 'glass'
        ? 'rgba(255,255,255,0.18)'
        : 'transparent';
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptic.light();
        onPress?.();
      }}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: bg,
          borderWidth: variant === 'secondary' || variant === 'glass' ? 1 : 0,
          borderColor: border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <View pointerEvents="none">{children}</View>
    </Pressable>
  );
}

export function FAB({
  onPress,
  children,
  size = 52,
  style,
}: {
  onPress?: () => void;
  children: ReactNode;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress?.();
      }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.primary,
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        },
        style,
      ]}
    >
      <View pointerEvents="none">{children}</View>
    </Pressable>
  );
}
