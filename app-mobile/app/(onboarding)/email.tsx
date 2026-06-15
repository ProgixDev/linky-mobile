import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Lock, Mail } from 'lucide-react-native';
import { Trans, useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { useAuth } from '../../src/stores/auth';
import { useRequestOtp } from '../../src/data/queries/auth';
import { toToastMessage } from '../../src/lib/api';
import { useToast } from '../../src/components/feedback/Toast';

export default function EmailRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const setChannel = useAuth((s) => s.setChannel);
  const setPendingEmail = useAuth((s) => s.setPendingEmail);
  const setPendingOtpId = useAuth((s) => s.setPendingOtpId);
  const setPendingDevCode = useAuth((s) => s.setPendingDevCode);
  const requestOtp = useRequestOtp();
  const toast = useToast();
  const trimmed = email.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const busy = requestOtp.isPending;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <View style={{ paddingTop: 8, paddingBottom: 24 }}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(onboarding)/auth-choice');
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft size={18} color={colors.text} />
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: colors.primarySoft,
              marginBottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Mail size={11} color={colors.primaryDeep} strokeWidth={2.25} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primaryDeep, letterSpacing: 0.4 }}>
              {t('onboarding.email.badge')}
            </Text>
          </View>

          <Text variant="dispL" style={{ fontSize: 32, lineHeight: 38 }}>
            {t('onboarding.email.title')}
          </Text>
          <Text
            variant="bodyM"
            tone="muted"
            style={{ marginTop: 10, fontSize: 15, lineHeight: 22, letterSpacing: 0 }}
          >
            {t('onboarding.email.subtitle')}
          </Text>

          <View style={{ marginTop: 28 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6, marginBottom: 8 }}>
              {t('onboarding.email.label')}
            </Text>
            <View
              style={{
                height: 56,
                paddingHorizontal: 16,
                borderRadius: 16,
                borderWidth: focused ? 2 : 1,
                borderColor: focused ? colors.primary : colors.border,
                backgroundColor: colors.card,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Mail size={18} color={focused ? colors.primary : colors.textMuted} strokeWidth={1.75} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('onboarding.email.placeholder')}
                placeholderTextColor={colors.textFaint}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={{
                  flex: 1,
                  fontSize: 16,
                  fontWeight: '500',
                  color: colors.text,
                  padding: 0,
                }}
              />
            </View>
          </View>

          <View
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.bgSunken,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <Lock size={14} color={colors.primary} strokeWidth={2} style={{ marginTop: 1 }} />
            <Text
              style={{
                flex: 1,
                fontSize: 12.5,
                lineHeight: 18,
                color: colors.textMuted,
                letterSpacing: 0,
              }}
            >
              <Trans
                i18nKey="onboarding.phone.legal"
                components={[
                  <Text key="0" style={{ color: colors.primaryDeep, fontWeight: '600' }} />,
                  <Text key="1" style={{ color: colors.primaryDeep, fontWeight: '600' }} />,
                ]}
              />
            </Text>
          </View>
        </View>

        <View style={{ paddingBottom: 4 }}>
          <Button
            variant="dark"
            size="lg"
            block
            label={busy ? t('onboarding.phone.ctaBusy') : t('onboarding.phone.cta')}
            disabled={!valid || busy}
            onPress={async () => {
              try {
                const { otp_id, dev_code } = await requestOtp.mutateAsync({ channel: 'email', target: trimmed });
                setChannel('email');
                setPendingEmail(trimmed);
                setPendingOtpId(otp_id);
                setPendingDevCode(dev_code ?? null);
                router.push('/(onboarding)/otp');
              } catch (e: unknown) {
                console.error('[otp-request:email] error:', e);
                toast.show(toToastMessage(e, t('onboarding.email.errorSend')), 'danger');
              }
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
