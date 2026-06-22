import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { useAuthStore } from '../model/store';

/**
 * Minimal functional auth screen (sign in / sign up). Intentionally plain —
 * visual design lands in Phase 4/7 via the design-system pass. What matters here
 * is the secure plumbing: validated input, real error/loading states, testIDs.
 */
export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [submitting, setSubmitting] = useState(false);

  const error = useAuthStore((s) => s.error);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);

  const submit = async () => {
    setSubmitting(true);
    await (mode === 'sign-in' ? signIn(email, password) : signUp(email, password));
    setSubmitting(false);
  };

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <AppText variant="display">
          {mode === 'sign-in' ? 'Welcome back' : 'Create account'}
        </AppText>

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
        />
        <TextField
          testID="auth-password"
          className="flex-none"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          textContentType="password"
        />

        {error ? (
          <AppText testID="auth-error" variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}

        <Button
          testID="auth-submit"
          label={mode === 'sign-in' ? 'Sign in' : 'Sign up'}
          loading={submitting}
          onPress={submit}
        />
        <Button
          testID="auth-toggle"
          variant="ghost"
          label={mode === 'sign-in' ? 'New here? Create an account' : 'Have an account? Sign in'}
          onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
        />
      </View>
    </Screen>
  );
}
