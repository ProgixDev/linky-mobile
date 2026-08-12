import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  BottomSheetModal,
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

/**
 * Bottom sheet, rendered THROUGH THE ROOT PORTAL.
 *
 * Why BottomSheetModal and not BottomSheet (client 2026-08-07, third report of
 * the same symptom): the plain `BottomSheet` renders inline, where it is
 * declared. Every sheet in this app is declared inside a tab screen, so the tab
 * bar — a sibling rendered after it — painted straight over the footer. On the
 * Immobilier filter that meant « Voir les résultats » sat under the tab bar and
 * could not be reached, no matter how the sheet was sized. Two earlier fixes
 * (flex:1 on the scroll view, then disabling dynamic sizing) were both real bugs
 * worth fixing, but neither was THIS one, because the problem was never height.
 *
 * `BottomSheetModal` renders into `BottomSheetModalProvider`, which is already
 * mounted at the root in app/_layout.tsx — so the sheet lands above the whole
 * app, tab bar included. The provider was there all along; this component just
 * never used it.
 */
export function Sheet({ open, onClose, snapPoints = ['60%', '90%'], title, children }: SheetProps) {
  const { colors, radii } = useTheme();
  const ref = useRef<BottomSheetModal>(null);
  const snaps = useMemo(() => snapPoints, [snapPoints]);

  // A modal is driven by present/dismiss rather than by mounting. Keeping it
  // always rendered is what lets it animate out instead of vanishing; it costs
  // nothing while closed, since the portal holds no content until presented.
  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.45} />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snaps}
      // v5 turns dynamic sizing ON by default: the sheet measures its CONTENT
      // and sizes itself to it, competing with the snap points we declared. Every
      // caller here passes explicit ones, so that was never the intended mode.
      enableDynamicSizing={false}
      enablePanDownToClose
      // SEUL chemin de fermeture vers le parent. Surtout PAS un onChange qui
      // testerait index === -1 : une modale signale -1 tant qu'elle est fermee,
      // donc au montage ET pendant l'animation d'ouverture. Le parent remettait
      // alors son etat a zero aussitot, la feuille se refermait dans la foulee,
      // et le bouton paraissait mort (regression introduite le 2026-08-11 en
      // passant au portail). onDismiss ne se declenche qu'a une vraie fermeture.
      onDismiss={onClose}
      // Keyboard handling for inputs inside the sheet (e.g. the city search).
      // fillParent = the sheet expands to the space above the keyboard on focus,
      // so the field always clears it (more reliable on Android edge-to-edge than
      // "interactive"). Restore on blur. Requires the input to be a
      // BottomSheetTextInput and the content a BottomSheetScrollView.
      keyboardBehavior="fillParent"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
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
    </BottomSheetModal>
  );
}
