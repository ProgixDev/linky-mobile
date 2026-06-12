import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Truck } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';

// Phase X.7 — the addresses backend is unbuilt in V1, so the "Ajouter une
// adresse" button (haptic-only onPress) was a dead promise. Collapsed to
// an honest informational screen ; the user understands the feature is
// coming and stops tapping a button that does nothing.

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
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: colors.accentSoft,
                marginBottom: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: '700',
                  color: colors.accentText,
                  letterSpacing: 0.5,
                }}
              >
                BIENTÔT
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
              Gestion des adresses
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
              Tu pourras bientôt enregistrer une adresse de livraison ici. En attendant, indique-la au moment de payer.
            </Text>
          </View>
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

