import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { useAuthStore } from '../model/store';

const RESEND_COOLDOWN_SEC = 60; // backend allows 3 requests/min — 60s keeps us safe.

/**
 * Livreur sign-in — Linky email OTP (self-rolled JWT, no password). Two steps,
 * driven by the store's `otpId`: enter email → “Send code”, then enter the
 * 6-digit code → “Verify”. Real loading/disabled/error states, a resend that
 * respects the rate limit, and — in stub/dev mode — the echoed `devCode` so QA
 * can proceed without an inbox. Never a dead end. Feature-prefixed testIDs.
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
      <View className="flex-1 justify-center gap-4">
        <View className="gap-1">
          <AppText variant="display">{step === 'email' ? 'Sign in' : 'Enter your code'}</AppText>
          <AppText variant="caption" className="text-ink-muted">
            {step === 'email'
              ? 'We’ll email you a 6-digit code to sign in.'
              : `Code sent to ${pendingEmail ?? 'your email'}.`}
          </AppText>
        </View>

        {step === 'email' ? (
          <>
            <TextField
              testID="auth-email"
              className="flex-none"
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!submitting}
              onSubmitEditing={() => void onSendCode()}
            />
            <Button
              testID="auth-request-code"
              label="Send code"
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
                Dev code: {devCode}
              </AppText>
            ) : null}

            <Button
              testID="auth-verify"
              label="Verify"
              loading={submitting}
              disabled={code.length !== 6}
              onPress={() => void onVerify()}
            />
            <Button
              testID="auth-resend"
              variant="ghost"
              label={resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
              disabled={resendIn > 0 || submitting}
              onPress={() => void onResend()}
            />
            <Button
              testID="auth-change-email"
              variant="ghost"
              label="Use a different email"
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
            Checking your session…
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}
