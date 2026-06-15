import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Lock, MessageSquare } from 'lucide-react-native';
import { Trans, useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { useAuth } from '../../src/stores/auth';
import { useRequestOtp } from '../../src/data/queries/auth';
import { toToastMessage } from '../../src/lib/api';
import { useToast } from '../../src/components/feedback/Toast';

function GuineaFlag() {
  return (
    <View
      style={{
        width: 22,
        height: 15,
        borderRadius: 3,
        flexDirection: 'row',
        overflow: 'hidden',
      }}
    >
      <View style={{ flex: 1, backgroundColor: '#CE1126' }} />
      <View style={{ flex: 1, backgroundColor: '#FCD116' }} />
      <View style={{ flex: 1, backgroundColor: '#009E49' }} />
    </View>
  );
}

export default function PhoneRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [focused, setFocused] = useState(false);
  const setChannel = useAuth((s) => s.setChannel);
  const setPendingPhone = useAuth((s) => s.setPendingPhone);
  const setPendingOtpId = useAuth((s) => s.setPendingOtpId);
  const setPendingDevCode = useAuth((s) => s.setPendingDevCode);
  const requestOtp = useRequestOtp();
  const toast = useToast();
  const valid = phone.replace(/\D/g, '').length >= 8;
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
            <MessageSquare size={11} color={colors.primaryDeep} strokeWidth={2.25} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primaryDeep, letterSpacing: 0.4 }}>
              {t('onboarding.phone.badge')}
            </Text>
          </View>

          <Text variant="dispL" style={{ fontSize: 32, lineHeight: 38 }}>
            {t('onboarding.phone.title')}
          </Text>
          <Text
            variant="bodyM"
            tone="muted"
            style={{ marginTop: 10, fontSize: 15, lineHeight: 22, letterSpacing: 0 }}
          >
            {t('onboarding.phone.subtitle')}
          </Text>

          <View style={{ marginTop: 28 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6, marginBottom: 8 }}>
              {t('onboarding.phone.label')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <Pressable
                style={{
                  height: 56,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <GuineaFlag />
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>+224</Text>
              </Pressable>
              <View
                style={{
                  flex: 1,
                  height: 56,
                  paddingHorizontal: 16,
                  borderRadius: 16,
                  borderWidth: focused ? 2 : 1,
                  borderColor: focused ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                  justifyContent: 'center',
                }}
              >
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  // Guinea mobile numbers are 9 digits; allow a little slack for
                  // any spaces a user types (the request strips non-digits).
                  maxLength={12}
                  placeholder={t('onboarding.phone.placeholder')}
                  placeholderTextColor={colors.textFaint}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  style={{
                    fontSize: 17,
                    fontWeight: '600',
                    color: colors.text,
                    letterSpacing: 0.5,
                    padding: 0,
                  }}
                />
              </View>
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
              const target = `+224${phone.replace(/\D/g, '')}`;
              try {
                const { otp_id, dev_code } = await requestOtp.mutateAsync({ channel: 'phone', target });
                setChannel('phone');
                setPendingPhone(`+224 ${phone}`);
                setPendingOtpId(otp_id);
                setPendingDevCode(dev_code ?? null);
                router.push('/(onboarding)/otp');
              } catch (e: unknown) {
                console.error('[otp-request] error:', e);
                toast.show(toToastMessage(e, t('onboarding.phone.errorSend')), 'danger');
              }
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
