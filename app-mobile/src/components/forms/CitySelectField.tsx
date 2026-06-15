import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, Check, MapPin, Search, X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { GUINEA_CITIES } from '../onboarding/CityMapPicker';
import { haptic } from '../../lib/haptics';

// A lightweight, map-free city picker that reuses the single source of truth
// (GUINEA_CITIES) so the value a seller/agent saves matches exactly what the
// Marché city filter offers. Free-text city inputs produced un-filterable
// values ("Conakry" vs "conakry" vs "Konakri") ; this guarantees clean data.
export function CitySelectField({
  label = 'Ville',
  value,
  onChange,
  placeholder = 'Choisis une ville',
}: {
  label?: string;
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
}) {
  const { colors, radii } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GUINEA_CITIES;
    return GUINEA_CITIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.region.toLowerCase().includes(q),
    );
  }, [query]);

  function pick(name: string) {
    haptic.selection();
    onChange(name);
    setOpen(false);
    setQuery('');
  }

  return (
    <View>
      {label && (
        <Text variant="micro" tone="muted" style={{ marginBottom: 6, textTransform: 'none', letterSpacing: 0 }}>
          {label}
        </Text>
      )}
      <Pressable
        onPress={() => {
          haptic.light();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={value ? `Ville : ${value}` : placeholder}
        style={{
          height: 48,
          borderRadius: radii.md,
          backgroundColor: colors.bgElev,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          gap: 10,
        }}
      >
        <MapPin size={18} color={value ? colors.primary : colors.textMuted} strokeWidth={2} />
        <Text style={{ flex: 1, fontSize: 14, color: value ? colors.text : colors.textFaint }}>
          {value || placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '78%',
            backgroundColor: colors.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            overflow: 'hidden',
          }}
        >
          <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 12,
              }}
            >
              <Text variant="titleM" style={{ fontSize: 16 }}>
                Choisis une ville
              </Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={10}
                accessibilityLabel="Fermer"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  backgroundColor: colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} color={colors.text} strokeWidth={2.25} />
              </Pressable>
            </View>

            {/* Search */}
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
              <View
                style={{
                  height: 44,
                  borderRadius: radii.md,
                  backgroundColor: colors.bgElev,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  gap: 8,
                }}
              >
                <Search size={16} color={colors.textMuted} strokeWidth={2} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Rechercher une ville ou une région"
                  placeholderTextColor={colors.textFaint}
                  autoCorrect={false}
                  style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 }}
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <X size={15} color={colors.textMuted} strokeWidth={2.25} />
                  </Pressable>
                )}
              </View>
            </View>

            {/* List */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            >
              {results.length === 0 ? (
                <Text tone="muted" style={{ textAlign: 'center', paddingVertical: 28 }}>
                  Aucune ville trouvée.
                </Text>
              ) : (
                results.map((c) => {
                  const active = c.name === value;
                  return (
                    <Pressable
                      key={c.name}
                      onPress={() => pick(c.name)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: active ? '700' : '500', color: active ? colors.primary : colors.text }}>
                          {c.name}
                        </Text>
                        <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                          Région de {c.region}
                        </Text>
                      </View>
                      {active && <Check size={18} color={colors.primary} strokeWidth={2.5} />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
