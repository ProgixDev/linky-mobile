// Location filter — a single row: "Toute la Guinée" + the 8 main cities (the
// region capitals, which share their region's name). The granular per-region
// city sub-list was removed (client 2026-07-26: too cluttered). Each chip is a
// direct city filter (backend filters city exactly); the 8 names all exist in
// GUINEA_CITIES so the filter always resolves.
import { Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';

const MAIN_CITIES = ['Conakry', 'Boké', 'Kindia', 'Labé', 'Mamou', 'Faranah', 'Kankan', 'Nzérékoré'] as const;

export function CityFilterChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (city: string | null) => void;
}) {
  const { colors } = useTheme();

  const chip = (label: string, active: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={{
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? colors.text : colors.bgSunken,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: active ? colors.bg : colors.textMuted }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {chip('Toute la Guinée', value === null, () => onChange(null), '__all__')}
      {MAIN_CITIES.map((c) => chip(c, value === c, () => onChange(value === c ? null : c), c))}
    </ScrollView>
  );
}
