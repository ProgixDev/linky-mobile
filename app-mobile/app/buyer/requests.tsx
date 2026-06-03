import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';

// Buyer-side visit/offer list. Backend endpoint (list-my-visit-requests) lands
// in V1.1 — until then the screen renders an empty state so users can still
// reach it from the profile, see what it's for, and avoid a "Mes demandes"
// row pointing to a 404.

export default function BuyerRequestsRoute() {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
      >
        <ScreenHeader
          title="Mes demandes"
          subtitle="Tes visites et offres en cours."
        />

        <View
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingTop: 60,
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              backgroundColor: colors.bgSunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CalendarDays size={24} color={colors.textMuted} strokeWidth={1.75} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
            Aucune demande pour le moment
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: colors.textMuted,
              textAlign: 'center',
              maxWidth: 280,
              lineHeight: 18,
            }}
          >
            Quand tu enverras une demande de visite ou une offre sur un bien, elle s'affichera ici avec son statut.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
