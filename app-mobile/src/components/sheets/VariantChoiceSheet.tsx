import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Sheet } from './Sheet';
import { Button } from '../primitives/Button';
import { Text } from '../primitives/Text';
import { useVariantSelection, VariantPicker } from '../product/VariantPicker';
import { variantLabel } from '../../lib/variantsDraft';
import { haptic } from '../../lib/haptics';
import type { Product } from '../../data/types';

// REFAIRE LE CHOIX D'UNE COMBINAISON, SANS QUITTER LE PANIER.
//
// ┌─ POURQUOI ICI ET PAS SUR LA FICHE ──────────────────────────────────────┐
// Le panier signalait « Choix à refaire » et renvoyait sur la fiche de
// l'article. Sauf qu'y ajouter la bonne taille crée une ligne SŒUR — le panier
// tient une ligne par couple (article, déclinaison) — et laisse la ligne morte
// en place : le blocage persistait, refaire le geste ajoutait une troisième
// ligne, et la seule sortie était de deviner qu'il fallait décrémenter la
// mauvaise jusqu'à la corbeille.
//
// La ligne cassée est DANS le panier : c'est donc là qu'on la répare. Deux
// touchers, la quantité est conservée, et rien ne se duplique.
// └─────────────────────────────────────────────────────────────────────────┘

/** Le sélecteur lui-même. Séparé pour être MONTÉ PAR ARTICLE (`key`) : l'état du
 *  choix vit dans `useVariantSelection`, et le réutiliser d'un article à l'autre
 *  proposerait la taille cochée pour le précédent. */
function Body({
  product,
  onPick,
}: {
  product: Product;
  onPick: (variant: { id: string; label?: string }) => void;
}) {
  const { t } = useTranslation();
  const sel = useVariantSelection(product.variants);
  const chosen = sel.selected;
  // Une combinaison épuisée reste pressable nulle part dans le sélecteur, mais
  // l'auto-sélection d'un axe à valeur unique peut en désigner une : le bouton
  // doit refuser, sinon le panier repartirait avec une ligne incommandable.
  const soldOut = !!chosen && chosen.stock !== null && chosen.stock <= 0;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 18 }}>
      <Text variant="caption" tone="muted" style={{ letterSpacing: 0 }} numberOfLines={2}>
        {product.title}
      </Text>

      {/* Il n'y a rien a choisir : la matrice n'est pas arrivee (get-product est
          la SEULE source qui la porte). Le dire, plutot que d'afficher une
          feuille vide avec un bouton mort. */}
      {sel.active ? (
        <VariantPicker sel={sel} />
      ) : (
        <Text variant="caption" tone="muted" style={{ letterSpacing: 0 }}>
          {t('states.errorGeneric')}
        </Text>
      )}

      <Button
        size="lg"
        block
        label={t('common.confirm')}
        disabled={!chosen || soldOut}
        onPress={() => {
          if (!chosen) return;
          haptic.light();
          onPick({ id: chosen.id, label: variantLabel(chosen) });
        }}
      />
    </View>
  );
}

export function VariantChoiceSheet({
  product,
  onClose,
  onPick,
}: {
  /** L'article dont la ligne attend un choix. `null` = feuille fermée. */
  product: Product | null;
  onClose: () => void;
  onPick: (variant: { id: string; label?: string }) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={!!product}
      onClose={onClose}
      title={t('create.variantsPick')}
      // Le panier est un écran de PILE : il n'a pas de barre d'onglets, et en
      // réserver la hauteur creuserait un trou de 70 px sous le bouton.
      reserveTabBar={false}
      // Hauteur déclarée plutôt que mesurée : vingt combinaisons font plusieurs
      // rangées de pastilles, et la mesure automatique pousse alors le bouton
      // hors de l'écran (c'est ce qui était arrivé au filtre Immobilier).
      snapPoints={['55%', '88%']}
    >
      {product ? <Body key={product.id} product={product} onPick={onPick} /> : null}
    </Sheet>
  );
}
