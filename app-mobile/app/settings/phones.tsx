import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Phone, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { haptic } from '../../src/lib/haptics';

// Phones backend lands in a later step. Until then the screen renders an empty
// state with the existing "Ajouter un numéro" CTA so users can already discover
// the feature without seeing stranger numbers pre-populated.

export default function PhonesRoute() {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title="Numéros de téléphone"
          subtitle="Les numéros utilisés pour ta connexion et tes notifications SMS."
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
              <Phone size={20} color={colors.textMuted} strokeWidth={1.75} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
              Aucun numéro ajouté
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
              Ajoute un numéro pour recevoir les codes SMS et notifications de commande.
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
              Ajouter un numéro
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
            <ShieldCheck size={14} color={colors.primary} strokeWidth={2} style={{ marginTop: 1 }} />
            <Text
              style={{
                flex: 1,
                fontSize: 12.5,
                lineHeight: 18,
                color: colors.textMuted,
                letterSpacing: 0,
              }}
            >
              Tes numéros restent privés. On ne les partage jamais avec les autres utilisateurs sans ton accord.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

