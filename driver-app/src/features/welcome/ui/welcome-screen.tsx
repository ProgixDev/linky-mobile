import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { AppText, LinkyMark, Screen } from '@/shared/ui';

const AUTO_ADVANCE_MS = 1900;

/**
 * Animated welcome — a branded Linky Driver logo reveal + tagline on cold launch
 * (first install only; gated by use-welcome-gate). The mark scales/fades in and the
 * tagline staggers underneath, then it auto-advances to get-started; tapping anywhere
 * skips immediately. Respects reduced motion (instant, no transform animation). It's a
 * pure transition screen — no business logic.
 */
export function WelcomeScreen() {
  const reduced = useReducedMotion();
  const advanced = useRef(false);

  const markOpacity = useSharedValue(reduced ? 1 : 0);
  const markScale = useSharedValue(reduced ? 1 : 0.85);
  const tagOpacity = useSharedValue(reduced ? 1 : 0);
  const tagY = useSharedValue(reduced ? 0 : 14);

  const advance = useCallback(() => {
    if (advanced.current) return;
    advanced.current = true;
    router.replace('/get-started');
  }, []);

  useEffect(() => {
    if (!reduced) {
      markOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
      markScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
      tagOpacity.value = withDelay(420, withTiming(1, { duration: 560 }));
      tagY.value = withDelay(
        420,
        withTiming(0, { duration: 560, easing: Easing.out(Easing.cubic) }),
      );
    }
    const t = setTimeout(advance, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [reduced, advance, markOpacity, markScale, tagOpacity, tagY]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagOpacity.value,
    transform: [{ translateY: tagY.value }],
  }));

  return (
    <Pressable
      testID="welcome-screen"
      className="flex-1"
      onPress={advance}
      accessibilityRole="button"
    >
      <Screen>
        <View className="flex-1 items-center justify-center gap-6">
          <Animated.View style={markStyle}>
            <LinkyMark size={124} />
          </Animated.View>
          <Animated.View style={tagStyle} className="items-center gap-1">
            <AppText variant="display">Linky Driver</AppText>
            <AppText variant="caption">L’app des livreurs Linky</AppText>
          </Animated.View>
        </View>
        <AppText variant="caption" className="pb-6 text-center text-ink-faint">
          Touche pour continuer
        </AppText>
      </Screen>
    </Pressable>
  );
}
