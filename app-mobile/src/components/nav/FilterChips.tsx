import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../primitives/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { haptic } from '../../lib/haptics';

/**
 * La rangee de pastilles de filtre — « Toutes / En cours / Terminees ».
 *
 * EXTRAITE DE app/orders/index.tsx le 2026-09-09, quand le client a demande le
 * meme filtre sur ses reservations : « On pourra rajouter un filtre ici comme
 * pour la partie Commandes ». Le recopier aurait donne deux rangees identiques
 * a maintenir — la forme de derive corrigee toute la journee ailleurs dans
 * cette application.
 *
 * ELLE DEFILE HORIZONTALEMENT, contrairement a l'originale. Les commandes n'ont
 * que trois filtres et tenaient sur une ligne ; les reservations en ont cinq,
 * et sur un ecran etroit la cinquieme sortait du cadre sans que rien ne
 * l'indique. Le defilement ne change rien quand tout tient, et sauve le cas ou
 * ca deborde.
 */
export interface FilterChip<T extends string> {
  id: T;
  label: string;
}

export function FilterChips<T extends string>({
  chips,
  value,
  onChange,
}: {
  chips: FilterChip<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
      style={{ marginBottom: 14, flexGrow: 0 }}
    >
      {chips.map((c) => {
        const active = value === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => {
              haptic.selection();
              onChange(c.id);
            }}
            style={{
              paddingHorizontal: 14,
              height: 36,
              borderRadius: 999,
              backgroundColor: active ? colors.text : colors.card,
              borderWidth: 1,
              borderColor: active ? colors.text : colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: active ? colors.bg : colors.text,
                letterSpacing: 0,
                lineHeight: 15,
                includeFontPadding: false,
              }}
            >
              {c.label}
            </Text>
          </Pressable>
        );
      })}
      {/* Une marge de fin, sinon la derniere pastille colle au bord quand la
          rangee deborde. */}
      <View style={{ width: 8 }} />
    </ScrollView>
  );
}
