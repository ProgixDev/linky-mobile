import { supabase } from '@/shared/lib/supabase';

/**
 * Extra auth flows on top of the skeleton's password sign-in: passwordless OTP
 * (email + SMS), password reset, and password update. All key-free to build;
 * SMS OTP needs an SMS provider configured in the Supabase dashboard to actually
 * deliver (email OTP works on the free tier out of the box).
 */
type Result = { ok: true } | { ok: false; error: string };

const wrap = (error: { message: string } | null): Result =>
  error ? { ok: false, error: error.message } : { ok: true };

export async function sendEmailOtp(email: string): Promise<Result> {
  return wrap((await supabase.auth.signInWithOtp({ email })).error);
}

export async function sendPhoneOtp(phone: string): Promise<Result> {
  return wrap((await supabase.auth.signInWithOtp({ phone })).error);
}

export async function verifyEmailOtp(email: string, token: string): Promise<Result> {
  return wrap((await supabase.auth.verifyOtp({ email, token, type: 'email' })).error);
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<Result> {
  return wrap((await supabase.auth.verifyOtp({ phone, token, type: 'sms' })).error);
}

export async function requestPasswordReset(email: string, redirectTo?: string): Promise<Result> {
  return wrap(
    (await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined))
      .error,
  );
}

export async function updatePassword(newPassword: string): Promise<Result> {
  return wrap((await supabase.auth.updateUser({ password: newPassword })).error);
}
