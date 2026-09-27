import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';
import type { ProductVariant } from '../../data/types';

// LE CHOIX DE LA DÉCLINAISON, côté acheteur.
//
// ┌─ LA TAILLE D'ABORD, LA COULEUR ENSUITE ─────────────────────────────────┐
// Le client a décrit son stock ainsi : « Taille 41 (Noire, rouge, bleue) /
// Taille 44 (Noire, rouge, bleue) ». La taille est l'axe principal, les
// couleurs vivent dessous. L'écran suit cet ordre : les couleurs se ferment en
// fonction de la taille choisie, jamais l'inverse.
//
// Une pastille ÉTEINTE n'est pas pressable. Un acheteur qui peut appuyer sur une
// combinaison épuisée et se voir refuser ensuite au panier ne comprend pas
// pourquoi ; qu'elle soit visiblement barrée le lui dit avant le geste. Les
// valeurs entièrement épuisées restent AFFICHÉES : les cacher ferait croire que
// la boutique ne les fait pas, alors qu'elles reviendront en stock.
// └─────────────────────────────────────────────────────────────────────────┘

export interface VariantSelection {
  /** Les tailles distinctes, dans l'ordre de saisie du vendeur. */
  sizes: string[];
  colors: string[];
  /** La valeur retenue sur chaque axe. `''` = axe non utilisé par le vendeur. */
  size: string | null;
  color: string | null;
  pickSize: (s: string) => void;
  pickColor: (c: string) => void;
  sizeEnabled: (s: string) => boolean;
  colorEnabled: (c: string) => boolean;
  /** La combinaison choisie. `null` tant que le choix est incomplet. */
  selected: ProductVariant | null;
  /** L'annonce se vend par combinaison, et il en manque une. */
  incomplete: boolean;
  /** Vrai quand l'écran doit afficher le sélecteur. */
  active: boolean;
}

const hasStock = (v: ProductVariant | undefined) => !!v && (v.stock === null || v.stock > 0);

/**
 * L'état du choix vit dans l'écran — la fiche a besoin de la combinaison pour
 * sa garde de stock et pour ses deux boutons — mais la RÈGLE vit ici : une
 * seule définition de « disponible », de l'auto-sélection et du nettoyage.
 */
export function useVariantSelection(variants: ProductVariant[] | undefined): VariantSelection {
  const list = variants ?? [];
  const [pickedSize, setPickedSize] = useState<string | null>(null);
  const [pickedColor, setPickedColor] = useState<string | null>(null);

  const axesKey = list.map((v) => `${v.size}\u0000${v.color}`).join('\u0001');
  const { sizes, colors } = useMemo(() => {
    const s: string[] = [];
    const c: string[] = [];
    for (const v of list) {
      if (v.size !== '' && !s.includes(v.size)) s.push(v.size);
      if (v.color !== '' && !c.includes(v.color)) c.push(v.color);
    }
    return { sizes: s, colors: c };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axesKey]);

  const find = (s: string, c: string) => list.find((v) => v.size === s && v.color === c);

  // UN AXE À UNE SEULE VALEUR EST DÉJÀ CHOISI. Un vendeur qui ne fait que du
  // noir ne doit pas obliger chaque acheteur à cocher « Noire » avant d'acheter.
  // Dérivé plutôt que posé dans un effet : l'annonce arrive après le premier
  // rendu, et un effet de synchronisation aurait laissé un instant pendant
  // lequel le bouton refuse alors qu'il n'y a rien à choisir.
  const size = sizes.length === 0 ? '' : (pickedSize ?? (sizes.length === 1 ? sizes[0] : null));
  const color = colors.length === 0 ? '' : (pickedColor ?? (colors.length === 1 ? colors[0] : null));

  const selected = size !== null && color !== null ? (find(size, color) ?? null) : null;

  return {
    sizes,
    colors,
    size,
    color,

    // Une taille n'est éteinte que si AUCUNE de ses couleurs n'est disponible :
    // elle est alors vraiment impossible à commander, quel que soit le reste du
    // choix. On ne la ferme pas en fonction de la couleur déjà cochée — cela
    // enfermerait l'acheteur dans un couple sans issue.
    sizeEnabled: (s: string) =>
      (colors.length === 0 ? [''] : colors).some((c) => hasStock(find(s, c))),

    // Une couleur, elle, dépend de la taille retenue : c'est l'ordre dans lequel
    // le vendeur compte son stock, et celui dans lequel l'acheteur choisit.
    colorEnabled: (c: string) =>
      size !== null
        ? hasStock(find(size, c))
        : (sizes.length === 0 ? [''] : sizes).some((s) => hasStock(find(s, c))),

    pickSize: (s: string) => {
      setPickedSize(s);
      // La couleur retenue peut ne pas exister dans la nouvelle taille. La
      // garder afficherait une combinaison épuisée comme si elle était choisie,
      // et le refus n'arriverait qu'au panier.
      if (pickedColor !== null && !hasStock(find(s, pickedColor))) setPickedColor(null);
    },
    pickColor: setPickedColor,
    selected,
    incomplete: list.length > 0 && selected === null,
    active: list.length > 0,
  };
}

export function VariantPicker({ sel }: { sel: VariantSelection }) {
  const { colors: c, radii } = useTheme();
  const { t } = useTranslation();
  if (!sel.active) return null;

  const rows: {
    key: string;
    label: string;
    values: string[];
    current: string | null;
    enabled: (v: string) => boolean;
    pick: (v: string) => void;
  }[] = [];

  if (sel.sizes.length > 0) {
    rows.push({
      key: 'size',
      label: t('create.variantsPickSize'),
      values: sel.sizes,
      current: sel.size,
      enabled: sel.sizeEnabled,
      pick: sel.pickSize,
    });
  }
  if (sel.colors.length > 0) {
    rows.push({
      key: 'color',
      label: t('create.variantsPickColor'),
      values: sel.colors,
      current: sel.color,
      enabled: sel.colorEnabled,
      pick: sel.pickColor,
    });
  }

  return (
    <View style={{ gap: 12 }}>
      {rows.map((row) => (
        <View key={row.key} style={{ gap: 8 }}>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0.4 }}>
            {row.label}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {row.values.map((v) => {
              const active = row.current === v;
              const on = row.enabled(v);
              return (
                <Pressable
                  key={v}
                  disabled={!on}
                  onPress={() => {
                    haptic.light();
                    row.pick(v);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !on }}
                  accessibilityLabel={on ? v : `${v} — ${t('create.variantsSoldOut')}`}
                  style={{
                    paddingVertical: 9,
                    paddingHorizontal: 14,
                    borderRadius: radii.pill,
                    borderWidth: active ? 1.5 : 1,
                    borderColor: !on ? c.border : active ? c.primary : c.borderStrong,
                    backgroundColor: !on ? c.bgSunken : active ? c.primarySoft : c.card,
                    opacity: on ? 1 : 0.45,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13.5,
                      fontWeight: active ? '700' : '600',
                      color: !on ? c.textFaint : active ? c.primary : c.text,
                      textDecorationLine: on ? 'none' : 'line-through',
                    }}
                  >
                    {v}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {/* L'état de la combinaison, en une ligne. « Il en reste 2 » est la seule
          information qui fasse accélérer un acheteur hésitant, et c'est aussi
          celle qui explique un refus avant qu'il ne se produise. */}
      {sel.incomplete ? (
        <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
          {t('create.variantsPick')}
        </Text>
      ) : sel.selected && sel.selected.stock !== null && sel.selected.stock <= 0 ? (
        <Text variant="micro" tone="danger" style={{ letterSpacing: 0, textTransform: 'none' }}>
          {t('create.variantsSoldOut')}
        </Text>
      ) : sel.selected && sel.selected.stock !== null && sel.selected.stock <= 3 ? (
        <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
          {t('create.variantsRemaining', { count: sel.selected.stock })}
        </Text>
      ) : null}
    </View>
  );
}
