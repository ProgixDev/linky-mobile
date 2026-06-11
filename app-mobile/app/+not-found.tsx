// Phase U.4 — branded 404. Stale push deeplinks (or anything that doesn't
// match a route) used to land on expo-router's default "Unmatched Route"
// debug screen. Calm French copy, one CTA back to the tabs.
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Compass } from 'lucide-react-native';
import { useTheme } from '../src/theme/ThemeProvider';
import { Text } from '../src/components/primitives/Text';
import { Button } from '../src/components/primitives/Button';

export default function NotFoundRoute() {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: 92,
            height: 92,
            borderRadius: 999,
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
          <Compass size={42} color={colors.primary} strokeWidth={1.75} />
        </View>
        <Text variant="dispL" center style={{ fontSize: 22, lineHeight: 28 }}>
          Cette page n'existe pas
        </Text>
        <Text
          variant="bodyM"
          tone="muted"
          center
          style={{ marginTop: 10, maxWidth: 300, lineHeight: 21 }}
        >
          Cette page n'existe pas ou n'est plus disponible. Reviens à l'accueil
          pour continuer.
        </Text>
        <View style={{ marginTop: 28, width: '100%', maxWidth: 280 }}>
          <Button
            variant="dark"
            size="lg"
            block
            label="Retour à l'accueil"
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
