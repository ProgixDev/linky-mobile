import { View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/shared/lib/cn';

export type ScreenProps = ViewProps & {
  /** Apply horizontal padding (default true). */
  padded?: boolean;
};

/**
 * Standard screen container: safe-area aware, themed background.
 * Every feature screen should render inside <Screen>.
 */
export function Screen({ padded = true, className, style, children, ...rest }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    // The top safe-area (status bar) gets a green band so the time / wifi / battery —
    // rendered as LIGHT status-bar content (see <StatusBar style="light"> in _layout) —
    // stay legible. A full-white screen hid them (white-on-white in dark mode). The
    // content area below keeps the white surface; only the notch strip is green.
    <View className="flex-1 bg-brand-600" style={{ paddingTop: insets.top }}>
      <View
        className={cn('flex-1 bg-surface', padded && 'px-5', className)}
        style={[{ paddingBottom: insets.bottom }, style]}
        {...rest}
      >
        {children}
      </View>
    </View>
  );
}
