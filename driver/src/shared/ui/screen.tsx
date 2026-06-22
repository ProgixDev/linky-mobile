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
    <View
      className={cn('flex-1 bg-surface', padded && 'px-5', className)}
      style={[{ paddingTop: insets.top, paddingBottom: insets.bottom }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}
