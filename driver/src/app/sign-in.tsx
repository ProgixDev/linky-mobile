import { SignInScreen } from '@/features/auth';

/**
 * Routes stay THIN — wire the URL to the feature screen. The root layout's
 * `useProtectedRoute` redirects here when there is no session.
 */
export default function SignInRoute() {
  return <SignInScreen />;
}
