// Location filter — a search box + a quick chip row.
// The chips are "Toute la Guinée" + the 8 main cities (region capitals). The
// search box (client 2026-07-27) lets the user reach ANY of the ~39 cities in
// GUINEA_CITIES by typing, since the chips only surface the 8 capitals and the
// per-region sub-list was removed. GUINEA_CITIES is the single source of truth
// (same list the seller/agent picks from), so the value always filters exactly.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
// BottomSheetTextInput (not RN's TextInput) so gorhom lifts the filter sheet
// above the keyboard on focus. This component is only rendered inside the
// Marché filter Sheet, which provides the required bottom-sheet context.
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Search } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { haptic } from '../../lib/haptics';
import { GUINEA_CITIES } from '../onboarding/CityMapPicker';

const MAIN_CITIES = ['Conakry', 'Boké', 'Kindia', 'Labé', 'Mamou', 'Faranah', 'Kankan', 'Nzérékoré'] as const;

// Accent- and case-insensitive so "labe" matches "Labé", "nzerekore" → "Nzérékoré".
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function CityFilterChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (city: string | null) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = norm(query);
    if (!q) return [];
    return GUINEA_CITIES.filter(
      (c) => norm(c.name).includes(q) || norm(c.region).includes(q),
    ).slice(0, 8);
  }, [query]);

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

  // A selected city that isn't one of the 8 quick chips (picked via search) —
  // surface it as its own active chip so the user always sees & can clear it.
  const selectedExtra = value && !(MAIN_CITIES as readonly string[]).includes(value) ? value : null;

  return (
    <View style={{ gap: 10 }}>
      {/* Search box — reach any city by typing */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 40,
          borderRadius: 999,
          backgroundColor: colors.bgSunken,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
          gap: 8,
        }}
      >
        <Search size={16} color={colors.textMuted} />
        <BottomSheetTextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('common.city.searchPlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={{ flex: 1, color: colors.text, fontSize: 13.5, padding: 0 }}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
        />
      </View>

      {/* Live results while typing */}
      {results.length > 0 && (
        <View
          style={{
            borderRadius: 12,
            backgroundColor: colors.bgElev,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {results.map((c, i) => (
            <Pressable
              key={c.name}
              onPress={() => {
                haptic.selection();
                onChange(c.name);
                setQuery('');
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.text }}>{c.name}</Text>
              <Text style={{ fontSize: 11, color: colors.textFaint }}>{c.region}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Quick chips: Toute la Guinée + (searched selection) + 8 main cities */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {chip('Toute la Guinée', value === null, () => onChange(null), '__all__')}
        {selectedExtra && chip(selectedExtra, true, () => onChange(null), '__selected__')}
        {MAIN_CITIES.map((c) => chip(c, value === c, () => onChange(value === c ? null : c), c))}
      </ScrollView>
    </View>
  );
}
