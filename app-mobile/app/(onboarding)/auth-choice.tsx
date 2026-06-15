import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ArrowRight, CreditCard, Phone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button, IconButton } from '../../src/components/primitives/Button';
import { useAuth } from '../../src/stores/auth';
import { haptic } from '../../src/lib/haptics';

type Channel = 'phone' | 'email';

interface Option {
  id: Channel;
  title: string;
  sub: string;
  Icon: LucideIcon;
}

export default function AuthChoiceRoute() {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const setChannel = useAuth((s) => s.setChannel);
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  // Returning users arrive with ?mode=login — the flow is the same passwordless
  // entry, but the copy reflects sign-in rather than sign-up.
  const isLogin = mode === 'login';
  const [choice, setChoice] = useState<Channel>('phone');
  // Phase I.3b — OPTIONS were at module scope, which froze the labels at the
  // first language i18next resolved. Memo inside the component so they flip
  // with the active language.
  const OPTIONS: Option[] = useMemo(
    () => [
      { id: 'phone', title: t('onboarding.authChoice.phoneTitle'), sub: t('onboarding.authChoice.phoneSub'), Icon: Phone },
      { id: 'email', title: t('onboarding.authChoice.emailTitle'), sub: t('onboarding.authChoice.emailSub'), Icon: CreditCard },
    ],
    [t],
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <View style={{ paddingTop: 4 }}>
          <IconButton
            variant="secondary"
            size={44}
            onPress={() => router.back()}
            accessibilityLabel={t('a11y.back')}
            style={{ marginLeft: -4 }}
          >
            <ArrowLeft size={20} color={colors.text} strokeWidth={2.25} />
          </IconButton>
        </View>

        <View style={{ marginTop: 40 }}>
          <Text style={{ fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6, color: colors.text }}>
            {isLogin ? t('onboarding.authChoice.titleLogin') : t('onboarding.authChoice.title')}
          </Text>
          <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
            {isLogin
              ? t('onboarding.authChoice.subtitleLogin')
              : t('onboarding.authChoice.subtitle')}
          </Text>
        </View>

        <View style={{ marginTop: 40, gap: 12 }}>
          {OPTIONS.map((opt) => {
            const selected = choice === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  haptic.selection();
                  setChoice(opt.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{
                  paddingVertical: 22,
                  paddingHorizontal: 20,
                  borderRadius: radii.lg,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.text : colors.border,
                  backgroundColor: colors.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: selected ? colors.text : colors.bgSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <opt.Icon
                    size={22}
                    color={selected ? colors.bg : colors.text}
                    strokeWidth={2.25}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{opt.title}</Text>
                  <Text style={{ marginTop: 2, fontSize: 13, color: colors.textMuted }}>{opt.sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 'auto', paddingBottom: 8 }}>
          <Button
            variant="dark"
            size="lg"
            block
            label={isLogin ? t('onboarding.authChoice.ctaLogin') : t('common.continue')}
            trailing={<ArrowRight size={18} color="#FFFFFF" strokeWidth={2.5} />}
            onPress={() => {
              haptic.medium();
              setChannel(choice);
              router.push(choice === 'phone' ? '/(onboarding)/phone' : '/(onboarding)/email');
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
