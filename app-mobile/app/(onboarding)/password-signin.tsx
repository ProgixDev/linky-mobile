import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Lock, Mail } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { useAuth } from '../../src/stores/auth';
import { useEmailSignin, usePhoneSignin } from '../../src/data/queries/auth';
import { toToastMessage } from '../../src/lib/api';
import { useToast } from '../../src/components/feedback/Toast';
import { haptic } from '../../src/lib/haptics';

// Opt-in alternative to the email-OTP flow (client 2026-08-05): anyone who set
// a password from Profil → Mot de passe can skip the OTP round-trip entirely.
// email-signin is the SAME endpoint the admin already uses daily — no new
// backend auth surface, just a second front door onto it. Enumeration-safe by
// design (server-side), so a wrong email/no-password account gets the exact
// same generic error as a wrong password — this screen never distinguishes.
export default function PasswordSigninRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Le meme ecran sert les deux canaux : on se connecte avec celui de son
  // inscription. Le parametre recu decide de la serrure interrogee.
  const params = useLocalSearchParams<{ email?: string; phone?: string }>();
  const isPhone = typeof params.phone === 'string' && params.phone.length > 0;
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [focusField, setFocusField] = useState<'email' | 'password' | null>(null);
  const setTokens = useAuth((s) => s.setTokens);
  const signIn = useAuth((s) => s.signIn);
  const completeOnboarding = useAuth((s) => s.completeOnboarding);
  const setPendingResetIntent = useAuth((s) => s.setPendingResetIntent);
  const emailSignin = useEmailSignin();
  const phoneSignin = usePhoneSignin();
  const signin = isPhone ? phoneSignin : emailSignin;
  const toast = useToast();

  const trimmedEmail = email.trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const valid = (isPhone || validEmail) && password.length >= 8;
  const busy = signin.isPending;

  const submit = async () => {
    if (!valid || busy) return;
    try {
      const { access_token, refresh_token, user } = isPhone
        ? await phoneSignin.mutateAsync({ phone: params.phone as string, password })
        : await emailSignin.mutateAsync({ email: trimmedEmail, password });
      await setTokens(access_token, refresh_token);
      signIn(user);
      // A password can only be set by an already-onboarded account (Profil →
      // Mot de passe requires being signed in), so this is always a returning
      // user — straight to the app, never profile-setup.
      completeOnboarding();
      haptic.success();
      router.replace('/(tabs)');
    } catch (e: unknown) {
      haptic.error();
      toast.show(toToastMessage(e, t('onboarding.passwordSignin.error')), 'danger');
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, paddingHorizontal: 24 }}>
          <View style={{ paddingTop: 8, paddingBottom: 24 }}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/email'))}
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
            <Text variant="dispL" style={{ fontSize: 32, lineHeight: 38 }}>
              {t('onboarding.passwordSignin.title')}
            </Text>
            <Text
              variant="bodyM"
              tone="muted"
              style={{ marginTop: 10, fontSize: 15, lineHeight: 22, letterSpacing: 0 }}
            >
              {t('onboarding.passwordSignin.subtitle')}
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
                  borderWidth: focusField === 'email' ? 2 : 1,
                  borderColor: focusField === 'email' ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Mail size={18} color={focusField === 'email' ? colors.primary : colors.textMuted} strokeWidth={1.75} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('onboarding.email.placeholder')}
                  placeholderTextColor={colors.textFaint}
                  onFocus={() => setFocusField('email')}
                  onBlur={() => setFocusField(null)}
                  style={{ flex: 1, fontSize: 16, fontWeight: '500', color: colors.text, padding: 0 }}
                />
              </View>
            </View>

            <View style={{ marginTop: 18 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6, marginBottom: 8 }}>
                {t('onboarding.passwordSignin.passwordLabel')}
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
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textFaint}
                  onFocus={() => setFocusField('password')}
                  onBlur={() => setFocusField(null)}
                  onSubmitEditing={submit}
                  returnKeyType="go"
                  style={{ flex: 1, fontSize: 16, fontWeight: '500', color: colors.text, padding: 0 }}
                />
              </View>
            </View>

            <Pressable
              onPress={() => router.replace('/(onboarding)/email')}
              hitSlop={8}
              style={{ marginTop: 16, alignSelf: 'flex-start' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primaryDeep, letterSpacing: 0 }}>
                {t('onboarding.passwordSignin.useCode')}
              </Text>
            </Pressable>

            {/* Forgot password: verifying an OTP already proves ownership of
                the account (email or phone, whichever they're comfortable
                with) exactly like a normal signin, so this just flags the
                intent and reuses that same hardened flow (client 2026-08-05) —
                see otp.tsx for the redirect to /settings/password. */}
            <Pressable
              onPress={() => {
                setPendingResetIntent(true);
                router.push('/(onboarding)/auth-choice?mode=login' as never);
              }}
              hitSlop={8}
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0 }}>
                {t('onboarding.passwordSignin.forgot')}
              </Text>
            </Pressable>
          </View>

          <View style={{ paddingBottom: 4, gap: 10 }}>
            <Button
              variant="dark"
              size="lg"
              block
              label={busy ? t('onboarding.passwordSignin.ctaBusy') : t('onboarding.passwordSignin.cta')}
              disabled={!valid || busy}
              onPress={submit}
            />
            {/* Repli par code, en bouton plein et non en lien discret. Tous les
                comptes creés AVANT l'inscription par mot de passe n'en ont pas :
                sans cette sortie visible, ils se retrouveraient devant un champ
                qu'ils ne peuvent pas remplir. Le meme ecran sert donc les deux
                generations d'utilisateurs. */}
            <Button
              variant="secondary"
              size="lg"
              block
              label="Recevoir un code à la place"
              disabled={busy}
              onPress={() => {
                haptic.light();
                router.push('/(onboarding)/auth-choice?mode=login' as never);
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
