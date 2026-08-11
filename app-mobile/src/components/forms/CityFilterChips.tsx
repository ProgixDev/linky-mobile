// Location filter — a search box + a single horizontal, swipeable row of EVERY
// Guinea city/prefecture (GUINEA_CITIES, the single source of truth the
// seller/agent also picks from, so the value always filters exactly). The
// search box just jumps to a city quickly (client 2026-07-27).
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
// react-native-gesture-handler's ScrollView (not RN's) so the horizontal chip
// row actually scrolls inside the @gorhom/bottom-sheet — a plain RN ScrollView's
// pan is swallowed by the sheet's gesture handler.
import { ScrollView } from 'react-native-gesture-handler';
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

      {/* Single horizontal, swipeable row of ALL Guinea cities/prefectures
          (client 2026-07-27). RNGH ScrollView so the swipe works inside the
          bottom sheet; the search box above jumps to any city quickly. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {chip('Toute la Guinée', value === null, () => onChange(null), '__all__')}
        {GUINEA_CITIES.map((c) =>
          chip(c.name, value === c.name, () => onChange(value === c.name ? null : c.name), c.name),
        )}
      </ScrollView>
    </View>
  );
}
