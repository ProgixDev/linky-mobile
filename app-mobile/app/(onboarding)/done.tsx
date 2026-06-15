import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { I } from '../../src/icons/Icon';
import { useAuth } from '../../src/stores/auth';
import { haptic } from '../../src/lib/haptics';

const CONFETTI = Array.from({ length: 24 }, (_, i) => i);

export default function OnboardingDoneRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const complete = useAuth((s) => s.completeOnboarding);
  const user = useAuth((s) => s.user);
  const firstName = (user?.display_name ?? '').split(' ')[0] || t('onboarding.done.fallbackName');

  useEffect(() => {
    haptic.success();
  }, []);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' }}>
        {CONFETTI.map((i) => (
          <Animated.View
            key={i}
            entering={FadeIn.delay(i * 30)}
            style={{
              position: 'absolute',
              left: `${(i * 37) % 100}%`,
              top: `${(i * 71) % 100}%`,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: [colors.primary, colors.accent, colors.success][i % 3],
                opacity: 0.55,
              }}
            />
          </Animated.View>
        ))}

        <View
          style={{
            width: 78,
            height: 78,
            borderRadius: 999,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
            shadowColor: colors.primary,
            shadowOpacity: 0.4,
            shadowRadius: 32,
            shadowOffset: { width: 0, height: 12 },
            elevation: 10,
          }}
        >
          <I.check size={38} color="#FFFFFF" stroke={2.5} />
        </View>
        <Text variant="dispL" center>
          {t('onboarding.done.greeting', { name: firstName })}
        </Text>
        <Text variant="bodyM" tone="muted" center style={{ marginTop: 6, maxWidth: 260 }}>
          {t('onboarding.done.subtitle')}
        </Text>

        <View style={{ marginTop: 28, width: '100%', gap: 8 }}>
          <Button
            variant="dark"
            size="compact"
            block
            label={t('onboarding.done.discover')}
            onPress={() => {
              complete();
              router.replace('/(tabs)');
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            block
            label={t('onboarding.done.kyc')}
            onPress={() => {
              complete();
              router.replace('/kyc/intro');
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
