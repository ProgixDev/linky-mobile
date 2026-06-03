import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, MapPin, Truck } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { haptic } from '../../src/lib/haptics';

// Addresses backend lands in a later step. Until then the screen renders an
// empty state with the existing "Ajouter une adresse" CTA so the entry from
// the profile leads somewhere meaningful instead of stranger addresses.

export default function AddressesRoute() {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title="Adresses"
          subtitle="Où on doit livrer ou venir chercher tes commandes."
        />

        <View style={{ paddingHorizontal: 24 }}>
          <View
            style={{
              paddingVertical: 32,
              alignItems: 'center',
              gap: 8,
              borderRadius: 18,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                backgroundColor: colors.bgSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MapPin size={20} color={colors.textMuted} strokeWidth={1.75} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
              Aucune adresse enregistrée
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: colors.textMuted,
                textAlign: 'center',
                maxWidth: 260,
                lineHeight: 17,
              }}
            >
              Enregistre une adresse pour livrer plus vite tes commandes.
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
          <Pressable
            onPress={() => haptic.light()}
            style={{
              height: 54,
              borderRadius: 16,
              backgroundColor: colors.text,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Plus size={16} color={colors.bg} strokeWidth={2.25} />
            <Text
              style={{
                fontSize: 14.5,
                fontWeight: '700',
                color: colors.bg,
                letterSpacing: 0,
                lineHeight: 17,
                includeFontPadding: false,
              }}
            >
              Ajouter une adresse
            </Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
          <View
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.bgSunken,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <Truck size={14} color={colors.primary} strokeWidth={2} style={{ marginTop: 1 }} />
            <Text
              style={{
                flex: 1,
                fontSize: 12.5,
                lineHeight: 18,
                color: colors.textMuted,
                letterSpacing: 0,
              }}
            >
              L'adresse principale est utilisée par défaut pour les livraisons. Tu peux toujours en changer au moment de payer.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

