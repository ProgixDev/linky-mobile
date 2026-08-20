import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, {
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

/** Hauteur de BottomTabBar (70 + ajustement systeme, voir ce composant). Toutes
 *  les feuilles de l'app sont ouvertes depuis un ecran d'onglet : la barre du
 *  bas, rendue apres elles, passe donc par-dessus leur pied de page. On reserve
 *  sa hauteur a l'interieur de la feuille plutot que de deplacer la feuille
 *  ailleurs dans l'arbre — un essai via BottomSheetModal et le portail racine a
 *  rendu TOUTES les feuilles inertes chez le client (2026-08-11), pour un
 *  probleme qui n'etait que de recouvrement visuel. */
function tabBarAllowance(insetBottom: number): number {
  return 70 + Math.max(insetBottom - 8, 0);
}

export function Sheet({ open, onClose, snapPoints = ['60%', '90%'], title, children }: SheetProps) {
  const { colors, radii } = useTheme();
  const insets = useSafeAreaInsets();
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

  // Monte a l'ouverture, demonte a la fermeture : c'est le comportement qui a
  // toujours fonctionne ici. Ne pas le remplacer par present()/dismiss() sans
  // l'avoir teste sur un appareil.
  if (!open) return null;

  return (
    <BottomSheet
      ref={ref}
      snapPoints={snaps}
      // v5 active le dimensionnement automatique par DEFAUT : la feuille se
      // mesure sur son contenu et entre en concurrence avec les hauteurs qu'on
      // vient de declarer. Sur le filtre Immobilier — le plus long de l'app —
      // la mesure l'emportait et le pied de page sortait de l'ecran. Tous les
      // appelants passent une hauteur explicite : ce mode n'a jamais ete voulu.
      enableDynamicSizing={false}
      enablePanDownToClose
      // Clavier : la feuille remonte au-dessus (recherche de ville). fillParent
      // est plus fiable qu'interactive sur Android bord-a-bord.
      keyboardBehavior="fillParent"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onChange={handleChanges}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong, width: 44 }}
      backgroundStyle={{ backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }}
    >
      {/* View SIMPLE, surtout pas BottomSheetView : celui-ci se MESURE SUR SON
          CONTENU. Sa hauteur suivait donc le contenu au lieu de remplir la
          feuille, et une zone defilante enfant ne recevait aucune borne — elle
          ne defilait donc pas reellement, son bas etait simplement coupe et
          devenait inatteignable. Symptome decisif signale par le client le
          2026-08-20 : « je ne peux pas defiler jusqu a voir les boutons ». Une
          zone qui defile vraiment finit toujours par montrer sa fin. */}
      <View style={{ flex: 1, paddingBottom: tabBarAllowance(insets.bottom) }}>
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
      </View>
    </BottomSheet>
  );
}
