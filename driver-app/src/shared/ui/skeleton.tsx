import { useEffect } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';

export type SkeletonProps = ViewProps & {
  /** Rounded corners (default true). Set false for square avatars/blocks. */
  rounded?: boolean;
};

/**
 * Loading placeholder. Use skeletons (not a bare spinner) for content loads >1s
 * so the layout doesn't jump — see docs/design/quality-bar.md. The pulse is
 * Reanimated and respects reduced-motion. Size it with className (e.g. "h-4 w-32").
 *
 * Pattern note: className lives on the plain wrapper View (sizing/radius); the
 * pulsing fill is a styled Animated.View — mirrors src/features/tasks/ui/task-row.
 */
export function Skeleton({ className, rounded = true, ...rest }: SkeletonProps) {
  const opacity = useSharedValue(0.5);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      opacity.value = 0.6;
      return;
    }
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduced]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View
      className={cn('h-4 w-full overflow-hidden', rounded && 'rounded-control', className)}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      {...rest}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceMuted }, pulse]}
      />
    </View>
  );
}
