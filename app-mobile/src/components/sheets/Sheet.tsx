import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import BottomSheet, {
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  snapPoints?: (string | number)[];
  title?: string;
  children: ReactNode;
}

export function Sheet({ open, onClose, snapPoints = ['60%', '90%'], title, children }: SheetProps) {
  const { colors, radii } = useTheme();
  const ref = useRef<BottomSheet>(null);
  const snaps = useMemo(() => snapPoints, [snapPoints]);

  const handleChanges = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.45} />
    ),
    [],
  );

  if (!open) return null;

  return (
    <BottomSheet
      ref={ref}
      snapPoints={snaps}
      // @gorhom/bottom-sheet v5 turns dynamic sizing ON by default, which makes
      // the sheet measure its CONTENT and size itself to it — quietly competing
      // with the snapPoints we just declared. On the Immobilier filter (type +
      // période + prix + ville + pièces + goudron + meublé) the measured height
      // won, the sheet grew past the screen, and « Voir les résultats » ended up
      // below the fold with no way to scroll to it (client 2026-08-05, still
      // reported 2026-08-07 after the flex:1 fix on the scroll view — that fix
      // was necessary but not sufficient).
      //
      // Every caller of this component passes explicit snap points, so dynamic
      // sizing was never the intended mode here. Off = the sheet is exactly as
      // tall as declared, and a flex:1 body with a pinned footer lays out.
      enableDynamicSizing={false}
      enablePanDownToClose
      // Keyboard handling for inputs inside the sheet (e.g. the city search).
      // fillParent = the sheet expands to the space above the keyboard on focus,
      // so the field always clears it (more reliable on Android edge-to-edge than
      // "interactive"). Restore on blur. Requires the input to be a
      // BottomSheetTextInput and the content a BottomSheetScrollView.
      keyboardBehavior="fillParent"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onChange={handleChanges}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong, width: 44 }}
      backgroundStyle={{ backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }}
    >
      <BottomSheetView style={{ flex: 1 }}>
        {title && (
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text variant="titleM" center>
              {title}
            </Text>
          </View>
        )}
        {children}
      </BottomSheetView>
    </BottomSheet>
  );
}
