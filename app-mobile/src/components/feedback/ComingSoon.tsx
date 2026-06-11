// Phase T.3 — branded "Bientôt disponible" surface. Used by screens whose
// V1 implementation would have required real backend that isn't shipping
// for launch (boost, promo codes, agent leases). Honest > fake.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { I, type IconKey } from '../../icons/Icon';

export function ComingSoonScreen({
  icon = 'bolt',
  title,
  blurb,
}: {
  icon?: IconKey;
  title: string;
  blurb: string;
}) {
  const { colors } = useTheme();
  const Icon = I[icon] ?? I.package;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          hitSlop={12}
          accessibilityLabel="Retour"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: colors.accentSoft,
            marginBottom: 20,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.accentText,
              letterSpacing: 0.6,
            }}
          >
            BIENTÔT DISPONIBLE
          </Text>
        </View>
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
          <Icon size={42} color={colors.primary} />
        </View>
        <Text variant="dispL" center style={{ fontSize: 22, lineHeight: 28 }}>
          {title}
        </Text>
        <Text
          variant="bodyM"
          tone="muted"
          center
          style={{ marginTop: 10, maxWidth: 320, lineHeight: 21 }}
        >
          {blurb}
        </Text>
      </View>
    </SafeAreaView>
  );
}
