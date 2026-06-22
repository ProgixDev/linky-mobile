/** Public API of the extended auth screens. */
export { OtpScreen } from './ui/otp-screen';
export { ForgotPasswordScreen } from './ui/forgot-password-screen';
export { OnboardingScreen } from './ui/onboarding-screen';
export { useOnboardingStore } from './onboarding-store';
export {
  sendEmailOtp,
  sendPhoneOtp,
  verifyEmailOtp,
  verifyPhoneOtp,
  requestPasswordReset,
  updatePassword,
} from './auth-extras';
export { EmailSchema, PhoneSchema, OtpSchema, NewPasswordSchema } from './model/auth';
