import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { requestPasswordReset } from '../auth-extras';
import { EmailSchema } from '../model/auth';

/** DESIGN: replace after the Claude Design pass. Functional placeholder. */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = EmailSchema.safeParse(email);
    if (!v.success) return setError(v.error.issues[0]?.message ?? 'Invalid');
    setError(null);
    setBusy(true);
    const r = await requestPasswordReset(v.data);
    setBusy(false);
    if (r.ok) setDone(true);
    else setError(r.error);
  };

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <AppText variant="display">Reset password</AppText>
        {done ? (
          <AppText variant="body">Check your email for a reset link.</AppText>
        ) : (
          <>
            <TextField
              testID="forgot-email"
              className="flex-none"
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {error ? (
              <AppText variant="caption" className="text-danger">
                {error}
              </AppText>
            ) : null}
            <Button
              testID="forgot-submit"
              label="Send reset link"
              loading={busy}
              onPress={() => void submit()}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
