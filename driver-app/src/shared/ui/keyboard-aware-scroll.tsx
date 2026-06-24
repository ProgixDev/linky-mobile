import { type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

// Lets the content container fill the viewport so an inner `grow`/`justify-center`
// (centered forms) works while still scrolling when content is tall. Module const so
// it isn't an inline-style literal.
const CONTENT_GROW = { flexGrow: 1 };

/**
 * Keyboard-aware scroll container for forms — keeps the focused field (with its label,
 * helper + error) AND the primary CTA visible above the keyboard by auto-scrolling the
 * focused input into view. `keyboardShouldPersistTaps="handled"` lets buttons/suggestions
 * stay tappable while the keyboard is open and dismisses it on an outside tap; dragging
 * also dismisses. Pass content-container classes via `contentClassName` (applied to an
 * inner View so we stay NativeWind-only). Imported directly (not via the shared barrel)
 * so its native module doesn't load into every consumer.
 */
export function KeyboardAwareScroll({
  children,
  contentClassName,
  testID,
}: {
  children: ReactNode;
  contentClassName?: string;
  testID?: string;
}) {
  return (
    <KeyboardAwareScrollView
      testID={testID}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      bottomOffset={24}
      contentContainerStyle={CONTENT_GROW}
    >
      <View className={contentClassName}>{children}</View>
    </KeyboardAwareScrollView>
  );
}
