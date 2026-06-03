// Phase K.7 — decommissioned. The seller-side refunds list became redundant
// once the OrderResolutionBanner (K.6) started rendering the verdict directly
// on each order detail. Route kept (not deleted) to honor bookmarked URLs and
// any in-flight deep links; renders a stand-in EmptyState pointing the
// seller back to their Boutique tab.

import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';

export default function RefundsRoute() {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Litiges" />

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
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShieldCheck size={24} color={colors.success} strokeWidth={2} />
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
          Aucun remboursement à gérer
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
          Les litiges sont traités directement par l&apos;équipe Linky. Vous serez notifié·e sur la commande concernée.
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
