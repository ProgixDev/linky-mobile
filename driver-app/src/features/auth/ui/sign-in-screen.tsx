import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, LinkyMark, Screen, TextField } from '@/shared/ui';
import { KeyboardAwareScroll } from '@/shared/ui/keyboard-aware-scroll';

import { useAuthStore } from '../model/store';

const RESEND_COOLDOWN_SEC = 60; // backend allows 3 requests/min — 60s keeps us safe.

/**
 * Livreur sign-in — Linky email OTP (self-rolled JWT, no password). Two steps,
 * driven by the store's `otpId`: enter email → « Recevoir le code », then enter
 * the 6-digit code → « Se connecter ». Branded Linky Driver header, French « tu »
 * copy, green CTA. Real loading/disabled/error states, a resend that respects the
 * rate limit, and — in stub/dev mode — the echoed `devCode` so QA can proceed
 * without an inbox. The OTP request/verify LOGIC is untouched; only the look +
 * copy changed. Feature-prefixed testIDs.
 */
export function SignInScreen() {
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const otpId = useAuthStore((s) => s.otpId);
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const devCode = useAuthStore((s) => s.devCode);
  const requestCode = useAuthStore((s) => s.requestCode);
  const verifyCode = useAuthStore((s) => s.verifyCode);
  const resendCode = useAuthStore((s) => s.resendCode);
  const resetOtp = useAuthStore((s) => s.resetOtp);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const step = otpId ? 'code' : 'email';

  // Resend cooldown countdown (1s tick) — gates the resend button after a send.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // Dev/QA convenience: in stub mode the backend echoes the OTP as `devCode` (NEVER in
  // real-email production, where the field is absent). Auto-fill it so QA + the Maestro
  // sign-in flow can proceed without an inbox; the code stays editable.
  useEffect(() => {
    if (devCode) setCode((c) => (c.length === 0 ? devCode : c));
  }, [devCode]);

  const onSendCode = async () => {
    setSubmitting(true);
    const result = await requestCode(email);
    setSubmitting(false);
    if (result.ok) {
      setCode('');
      setResendIn(RESEND_COOLDOWN_SEC);
    }
  };

  const onVerify = async () => {
    setSubmitting(true);
    await verifyCode(code);
    setSubmitting(false);
  };

  const onResend = async () => {
    if (resendIn > 0 || submitting) return;
    setSubmitting(true);
    const result = await resendCode();
    setSubmitting(false);
    if (result.ok) {
      setCode('');
      setResendIn(RESEND_COOLDOWN_SEC);
    }
  };

  const onChangeEmail = () => {
    setCode('');
    setResendIn(0);
    resetOtp();
  };

  return (
    <Screen testID="auth-sign-in-screen">
      <KeyboardAwareScroll contentClassName="grow justify-center gap-9">
        {/* Brand header */}
        <View className="items-center gap-3">
          <LinkyMark size={76} />
          <View className="items-center gap-1">
            <AppText variant="display" className="text-2xl">
              Linky Driver
            </AppText>
            <AppText variant="caption">L’app des livreurs Linky</AppText>
          </View>
        </View>

        {/* Form */}
        <View className="gap-4">
          <View className="gap-1">
            <AppText variant="title">{step === 'email' ? 'Connexion' : 'Vérification'}</AppText>
            <AppText variant="caption">
              {step === 'email'
                ? 'On t’envoie un code à 6 chiffres par e-mail pour te connecter.'
                : `Code envoyé à ${pendingEmail ?? 'ton e-mail'}.`}
            </AppText>
          </View>

          {step === 'email' ? (
            <>
              <TextField
                testID="auth-email"
                className="flex-none"
                value={email}
                onChangeText={setEmail}
                placeholder="ton@email.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                editable={!submitting}
                onSubmitEditing={() => void onSendCode()}
              />
              <Button
                testID="auth-request-code"
                label="Recevoir le code"
                loading={submitting}
                disabled={email.trim().length === 0}
                onPress={() => void onSendCode()}
              />
            </>
          ) : (
            <>
              <TextField
                testID="auth-code"
                className="flex-none tracking-[8px]"
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="------"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                editable={!submitting}
                onSubmitEditing={() => void onVerify()}
              />

              {devCode ? (
                <AppText testID="auth-dev-code" variant="caption" className="text-ink-muted">
                  Code (dev) : {devCode}
                </AppText>
              ) : null}

              <Button
                testID="auth-verify"
                label="Se connecter"
                loading={submitting}
                disabled={code.length !== 6}
                onPress={() => void onVerify()}
              />
              <Button
                testID="auth-resend"
                variant="ghost"
                label={resendIn > 0 ? `Renvoyer dans ${resendIn}s` : 'Renvoyer le code'}
                disabled={resendIn > 0 || submitting}
                onPress={() => void onResend()}
              />
              <Button
                testID="auth-change-email"
                variant="ghost"
                label="Changer d’e-mail"
                disabled={submitting}
                onPress={onChangeEmail}
              />
            </>
          )}

          {error ? (
            <AppText testID="auth-error" variant="caption" className="text-danger">
              {error}
            </AppText>
          ) : null}

          {status === 'loading' ? (
            <AppText testID="auth-status-loading" variant="caption" className="text-ink-faint">
              Vérification de ta session…
            </AppText>
          ) : null}
        </View>
      </KeyboardAwareScroll>
    </Screen>
  );
}
