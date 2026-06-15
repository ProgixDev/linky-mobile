// Phase K.7 — decommissioned. Detail page for a refund case is no longer
// reachable from the nav (entry removed from ProDashboard) and no longer
// surfaces real data. Kept as a stub so old deep links land somewhere
// intelligible instead of a 404.

import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArchiveX } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';

export default function RefundDetailRoute() {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Litige" />

      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          gap: 14,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            backgroundColor: colors.bgSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArchiveX size={24} color={colors.textMuted} strokeWidth={2} />
        </View>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: colors.text,
            textAlign: 'center',
            lineHeight: 22,
            includeFontPadding: false,
          }}
        >
          Cette section n&apos;est plus disponible
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: colors.textMuted,
            textAlign: 'center',
            lineHeight: 19,
            letterSpacing: 0,
            maxWidth: 320,
          }}
        >
          Les litiges sont traités par l&apos;équipe Linky. Retrouve le détail de la résolution sur la commande concernée.
        </Text>
        <Pressable
          onPress={() => {
            haptic.light();
            router.replace('/(tabs)/boutique');
          }}
          style={{
            marginTop: 8,
            paddingHorizontal: 22,
            height: 48,
            borderRadius: 14,
            backgroundColor: colors.text,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: colors.bg,
              lineHeight: 17,
              includeFontPadding: false,
            }}
          >
            Retour à Boutique
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
