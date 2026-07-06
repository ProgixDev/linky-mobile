import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from './Text';
import { haptic } from '../../lib/haptics';
import { I } from '../../icons/Icon';

const HOLD_MS = 5000;

export function HoldToConfirmButton({
  label = 'Maintiens pour confirmer la réception',
  onConfirm,
  disabled,
  holdMs,
}: {
  label?: string;
  onConfirm: () => void;
  disabled?: boolean;
  holdMs?: number;
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useAnimatedReaction(
    () => progress.value,
    (val, prev) => {
      if (val >= 1 && (prev ?? 0) < 1) {
        runOnJS(haptic.success)();
        runOnJS(onConfirm)();
        // Re-arm after firing: without this, progress stays at 1 and the
        // button is dead until remount — which kills retry paths that keep
        // the same button mounted (e.g. a dismissed booking payment sheet).
        progress.value = withTiming(0, { duration: 350 });
      }
    },
  );

  const fill = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const start = () => {
    if (disabled) return;
    haptic.light();
    progress.value = withTiming(1, { duration: holdMs ?? HOLD_MS });
  };
  const cancel = () => {
    cancelAnimation(progress);
    if (progress.value < 1) {
      progress.value = withTiming(0, { duration: 200 });
    }
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: '100%',
        height: 56,
        borderRadius: 999,
        backgroundColor: colors.primary,
        overflow: 'hidden',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            backgroundColor: colors.primaryDeep,
          },
          fill,
        ]}
      />
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 18,
        }}
      >
        <I.check size={18} color="#FFFFFF" />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{ flexShrink: 1, textAlign: 'center', color: '#FFFFFF', fontWeight: '600', fontSize: 15 }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
