// Compact region → city two-step for filter sheets. Replaces the 39-chip city
// wall: pick a region (8 tabs), then a city within it. "Toute la Guinée" clears.
// Reuses the single source of truth GUINEA_CITIES/regions (CityMapPicker).
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Chip } from '../primitives/Chip';
import { haptic } from '../../lib/haptics';
import { GUINEA_CITIES } from '../onboarding/CityMapPicker';

const REGIONS = ['Conakry', 'Boké', 'Kindia', 'Labé', 'Mamou', 'Faranah', 'Kankan', 'Nzérékoré'] as const;

export function CityFilterChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (city: string | null) => void;
}) {
  const { colors } = useTheme();
  const selectedRegion = useMemo(
    () => GUINEA_CITIES.find((c) => c.name === value)?.region ?? null,
    [value],
  );
  const [region, setRegion] = useState<string>(selectedRegion ?? 'Conakry');
  const cities = useMemo(() => GUINEA_CITIES.filter((c) => c.region === region), [region]);

  return (
    <View style={{ gap: 8 }}>
      {/* "Everywhere" + region tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Pressable
          onPress={() => { haptic.selection(); onChange(null); }}
          style={{
            height: 32,
            paddingHorizontal: 12,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: value === null ? colors.text : colors.bgSunken,
          }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: value === null ? colors.bg : colors.textMuted }}>
            Toute la Guinée
          </Text>
        </Pressable>
        {REGIONS.map((r) => {
          const on = r === region;
          return (
            <Pressable
              key={r}
              onPress={() => { haptic.selection(); setRegion(r); }}
              style={{
                height: 32,
                paddingHorizontal: 12,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? colors.text : colors.bgSunken,
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? colors.bg : colors.textMuted }}>
                {r}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {/* Cities of the active region */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {cities.map((c) => (
          <Chip
            key={c.name}
            label={c.name}
            active={value === c.name}
            onPress={() => onChange(value === c.name ? null : c.name)}
          />
        ))}
      </View>
    </View>
  );
}
