import * as Haptics from 'expo-haptics';

/**
 * Fire-and-forget haptics that never throw (no-op on unsupported devices /
 * emulators). Call from the JS thread (use runOnJS from a Reanimated worklet).
 */
export const haptics = {
  light: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      /* best-effort */
    });
  },
  medium: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
      /* best-effort */
    });
  },
  success: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      /* best-effort */
    });
  },
};
