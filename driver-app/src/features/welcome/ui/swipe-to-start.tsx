import { ChevronsRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/shared/lib/haptics';
import { colors } from '@/shared/theme/colors';
import { AppText } from '@/shared/ui';

const KNOB = 56;
const INSET = 4;
const COMPLETE_AT = 0.75; // fraction of travel that triggers start

/**
 * Swipe-to-start — drag the knob ≥75% to begin (success haptic → onComplete);
 * release short springs back (light haptic). A green fill grows behind the knob and
 * the label fades as it travels. Idle "nudge" hints it's swipeable. A11y/reduced-
 * motion: it's ALSO a real button (double-tap / tap to start), never swipe-only.
 */
export function SwipeToStart({
  onComplete,
  label = 'Glisser pour commencer',
  testID = 'getstarted-swipe',
}: {
  onComplete: () => void;
  label?: string;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const [trackW, setTrackW] = useState(0);
  const x = useSharedValue(0);
  const done = useSharedValue(false);
  const maxX = Math.max(0, trackW - KNOB - INSET * 2);

  // Idle nudge to signal swipeability (stops on touch; off under reduced motion).
  useEffect(() => {
    if (reduced || maxX <= 0) return;
    x.value = withRepeat(
      withSequence(withTiming(8, { duration: 700 }), withTiming(0, { duration: 700 })),
      -1,
      false,
    );
    return () => cancelAnimation(x);
  }, [reduced, maxX, x]);

  const complete = () => {
    haptics.success();
    onComplete();
  };

  const onLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);

  const pan = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(x);
      x.value = 0;
    })
    .onUpdate((e) => {
      if (done.value) return;
      x.value = Math.min(Math.max(0, e.translationX), maxX);
    })
    .onEnd(() => {
      if (maxX <= 0) return;
      if (x.value >= maxX * COMPLETE_AT) {
        done.value = true;
        x.value = withTiming(maxX, { duration: 140 });
        runOnJS(complete)();
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 220 });
        runOnJS(haptics.light)();
      }
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.value + KNOB + INSET }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: maxX > 0 ? interpolate(x.value, [0, maxX * 0.4], [1, 0], 'clamp') : 1,
  }));

  return (
    <View
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Commencer"
      accessibilityHint="Glisse le bouton ou appuie deux fois pour commencer"
      onAccessibilityTap={complete}
      onLayout={onLayout}
      className="h-16 justify-center overflow-hidden rounded-full bg-surface shadow-lg"
    >
      <Animated.View
        className="absolute bottom-0 left-0 top-0 rounded-full bg-brand-500/20"
        style={fillStyle}
      />
      <Animated.View
        className="absolute left-0 right-0 items-center"
        style={labelStyle}
        pointerEvents="none"
      >
        <AppText variant="label" className="text-brand-500">
          {label}
        </AppText>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          className="absolute left-1 top-1 h-14 w-14 items-center justify-center rounded-full bg-brand-500 shadow-sm"
          style={knobStyle}
        >
          <ChevronsRight size={26} color={colors.inkInverse} strokeWidth={2.5} />
        </Animated.View>
      </GestureDetector>
      {/* Reduced-motion / screen-reader fallback: a plain full-size tap target. */}
      {reduced ? (
        <Pressable
          testID={`${testID}-tap`}
          onPress={complete}
          accessibilityRole="button"
          accessibilityLabel="Commencer"
          className="absolute bottom-0 left-0 right-0 top-0"
        />
      ) : null}
    </View>
  );
}
