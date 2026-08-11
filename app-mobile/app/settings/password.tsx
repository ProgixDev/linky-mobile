import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Eye, EyeOff, Lock, Mail, Phone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { useSetPassword, usePasswordChangeRequest } from '../../src/data/queries/auth';
import { useToast } from '../../src/components/feedback/Toast';
import { ApiError, toToastMessage } from '../../src/lib/api';
import { haptic } from '../../src/lib/haptics';

const PASSWORD_MIN = 8;

// Opt-in: a marketplace account signs up via OTP and starts with no password.
// Setting one here just adds a SECOND way in (email-signin, already the
// admin's login) — OTP keeps working exactly as before either way (client
// 2026-08-05).
//
// Step-up: a STALE session (>10 min old — the "phone left signed in" case)
// gets OTP_REQUIRED back from the server and this screen reveals an inline
// confirm-by-code step. A FRESH session (just signed in, including via "mot
// de passe oublié") sails through with no extra step — see set-password's
// header comment for why that split is safe.
export default function SetPasswordRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [focusField, setFocusField] = useState<'password' | 'confirm' | 'code' | null>(null);
  const [otpStep, setOtpStep] = useState<'none' | 'choose' | 'code'>('none');
  const [otpId, setOtpId] = useState<string | null>(null);
  const [targetMasked, setTargetMasked] = useState('');
  const [code, setCode] = useState('');
  const setPasswordMutation = useSetPassword();
  const changeRequest = usePasswordChangeRequest();
  const toast = useToast();

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN;
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = password.length >= PASSWORD_MIN && confirm === password;

  const finish = () => {
    haptic.success();
    toast.show(t('settings.password.success'), 'success');
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profil');
  };

  const submit = async () => {
    if (!valid || setPasswordMutation.isPending) return;
    try {
      await setPasswordMutation.mutateAsync({ password });
      finish();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'OTP_REQUIRED') {
        setOtpStep('choose');
        return;
      }
      toast.show(toToastMessage(e, t('settings.password.error')), 'danger');
    }
  };

  const requestCode = async (channel: 'email' | 'phone') => {
    if (changeRequest.isPending) return;
    try {
      const res = await changeRequest.mutateAsync(channel);
      setOtpId(res.otp_id);
      setTargetMasked(res.target_masked);
      setOtpStep('code');
      haptic.light();
    } catch (e: unknown) {
      toast.show(toToastMessage(e, t('settings.password.otpSendError')), 'danger');
    }
  };

  const confirmWithCode = async () => {
    if (!otpId || code.length !== 6 || setPasswordMutation.isPending) return;
    try {
      await setPasswordMutation.mutateAsync({ password, otpId, code });
      finish();
    } catch (e: unknown) {
      toast.show(toToastMessage(e, t('settings.password.otpInvalid')), 'danger');
      setCode('');
      haptic.warning();
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenHeader title={t('settings.password.title')} subtitle={t('settings.password.subtitle')} />

        <View style={{ flex: 1, paddingHorizontal: 24 }}>
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6, marginBottom: 8 }}>
              {t('settings.password.newLabel')}
            </Text>
            <View
              style={{
                height: 56,
                paddingHorizontal: 16,
                borderRadius: 16,
                borderWidth: focusField === 'password' ? 2 : 1,
                borderColor: focusField === 'password' ? colors.primary : colors.border,
                backgroundColor: colors.card,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Lock size={18} color={focusField === 'password' ? colors.primary : colors.textMuted} strokeWidth={1.75} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!reveal}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                onFocus={() => setFocusField('password')}
                onBlur={() => setFocusField(null)}
                returnKeyType="next"
                style={{ flex: 1, fontSize: 16, fontWeight: '500', color: colors.text, padding: 0 }}
              />
              <Pressable onPress={() => setReveal((v) => !v)} hitSlop={8}>
                {reveal ? (
                  <EyeOff size={18} color={colors.textMuted} strokeWidth={1.75} />
                ) : (
                  <Eye size={18} color={colors.textMuted} strokeWidth={1.75} />
                )}
              </Pressable>
            </View>
            {tooShort ? (
              <Text style={{ marginTop: 6, fontSize: 12, color: colors.danger, letterSpacing: 0 }}>
                {t('settings.password.tooShort', { min: PASSWORD_MIN })}
              </Text>
            ) : null}
          </View>

          <View style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6, marginBottom: 8 }}>
              {t('settings.password.confirmLabel')}
            </Text>
            <View
              style={{
                height: 56,
                paddingHorizontal: 16,
                borderRadius: 16,
                borderWidth: focusField === 'confirm' ? 2 : 1,
                borderColor: focusField === 'confirm' ? colors.primary : colors.border,
                backgroundColor: colors.card,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Lock size={18} color={focusField === 'confirm' ? colors.primary : colors.textMuted} strokeWidth={1.75} />
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!reveal}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                onFocus={() => setFocusField('confirm')}
                onBlur={() => setFocusField(null)}
                onSubmitEditing={otpStep === 'none' ? submit : undefined}
                returnKeyType="go"
                style={{ flex: 1, fontSize: 16, fontWeight: '500', color: colors.text, padding: 0 }}
              />
            </View>
            {mismatch ? (
              <Text style={{ marginTop: 6, fontSize: 12, color: colors.danger, letterSpacing: 0 }}>
                {t('settings.password.mismatch')}
              </Text>
            ) : null}
          </View>

          {/* Step-up: only shown when the server flags a stale session. */}
          {otpStep !== 'none' ? (
            <View
              style={{
                marginTop: 22,
                padding: 16,
                borderRadius: 16,
                backgroundColor: colors.bgSunken,
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, letterSpacing: 0 }}>
                {t('settings.password.otpTitle')}
              </Text>
              {otpStep === 'choose' ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 12.5, color: colors.textMuted, letterSpacing: 0, lineHeight: 18 }}>
                    {t('settings.password.otpSubtitle')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable
                      onPress={() => requestCode('email')}
                      disabled={changeRequest.isPending}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        height: 44,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      }}
                    >
                      <Mail size={15} color={colors.text} strokeWidth={2} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, letterSpacing: 0 }}>
                        {t('settings.password.byEmail')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => requestCode('phone')}
                      disabled={changeRequest.isPending}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        height: 44,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      }}
                    >
                      <Phone size={15} color={colors.text} strokeWidth={2} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, letterSpacing: 0 }}>
                        {t('settings.password.bySms')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 12.5, color: colors.textMuted, letterSpacing: 0, lineHeight: 18 }}>
                    {t('settings.password.otpSentTo', { target: targetMasked })}
                  </Text>
                  <TextInput
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    placeholder="000000"
                    placeholderTextColor={colors.textFaint}
                    onFocus={() => setFocusField('code')}
                    onBlur={() => setFocusField(null)}
                    onSubmitEditing={confirmWithCode}
                    maxLength={6}
                    style={{
                      height: 52,
                      borderRadius: 12,
                      borderWidth: focusField === 'code' ? 2 : 1,
                      borderColor: focusField === 'code' ? colors.primary : colors.border,
                      backgroundColor: colors.card,
                      paddingHorizontal: 16,
                      fontSize: 20,
                      fontWeight: '700',
                      letterSpacing: 4,
                      color: colors.text,
                    }}
                  />
                  <Button
                    variant="dark"
                    size="md"
                    block
                    label={setPasswordMutation.isPending ? t('settings.password.ctaBusy') : t('settings.password.otpConfirm')}
                    disabled={code.length !== 6 || setPasswordMutation.isPending}
                    onPress={confirmWithCode}
                  />
                </View>
              )}
            </View>
          ) : null}
        </View>

        {otpStep === 'none' ? (
          <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 + insets.bottom }}>
            <Button
              variant="dark"
              size="lg"
              block
              label={setPasswordMutation.isPending ? t('settings.password.ctaBusy') : t('settings.password.cta')}
              disabled={!valid || setPasswordMutation.isPending}
              onPress={submit}
            />
          </View>
        ) : (
          <View style={{ paddingBottom: insets.bottom + 16 }} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
