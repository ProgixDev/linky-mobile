import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { sendEmailOtp, sendPhoneOtp, verifyEmailOtp, verifyPhoneOtp } from '../auth-extras';
import { EmailSchema, OtpSchema, PhoneSchema } from '../model/auth';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder OTP flow —
 * works for email OR phone (`channel`). Proves send-code → verify end to end.
 */
export function OtpScreen({
  channel = 'email',
  onVerified,
}: {
  channel?: 'email' | 'phone';
  onVerified?: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const v = (channel === 'email' ? EmailSchema : PhoneSchema).safeParse(identifier);
    if (!v.success) return setError(v.error.issues[0]?.message ?? 'Invalid');
    setError(null);
    setBusy(true);
    const r = channel === 'email' ? await sendEmailOtp(v.data) : await sendPhoneOtp(v.data);
    setBusy(false);
    if (r.ok) setSent(true);
    else setError(r.error);
  };

  const verify = async () => {
    const v = OtpSchema.safeParse(code);
    if (!v.success) return setError(v.error.issues[0]?.message ?? 'Invalid');
    setBusy(true);
    const r =
      channel === 'email'
        ? await verifyEmailOtp(identifier.trim(), v.data)
        : await verifyPhoneOtp(identifier.trim(), v.data);
    setBusy(false);
    if (r.ok) onVerified?.();
    else setError(r.error);
  };

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <AppText variant="display">
          {sent
            ? 'Enter the code'
            : channel === 'email'
              ? 'Sign in with email'
              : 'Sign in with phone'}
        </AppText>
        {!sent ? (
          <>
            <TextField
              testID="otp-identifier"
              className="flex-none"
              value={identifier}
              onChangeText={setIdentifier}
              placeholder={channel === 'email' ? 'Email' : '+1 415 555 1234'}
              autoCapitalize="none"
              keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
            />
            <Button
              testID="otp-send"
              label="Send code"
              loading={busy}
              onPress={() => void send()}
            />
          </>
        ) : (
          <>
            <TextField
              testID="otp-code"
              className="flex-none"
              value={code}
              onChangeText={setCode}
              placeholder="Code"
              keyboardType="number-pad"
            />
            <Button
              testID="otp-verify"
              label="Verify"
              loading={busy}
              onPress={() => void verify()}
            />
          </>
        )}
        {error ? (
          <AppText testID="otp-error" variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}
