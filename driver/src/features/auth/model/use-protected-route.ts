import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useAuthStore } from './store';

// Typed-routes (`experiments.typedRoutes`) generates the Href union from the
// filesystem at Expo build/start time. We cast these two literals so a cold
// `tsc` (before `.expo/types` regenerates to include /sign-in) still type-checks.
const SIGN_IN = '/sign-in' as Href;
const HOME = '/' as Href;

/**
 * Redirect based on auth state:
 *   - unauthenticated + not on the sign-in screen → /sign-in
 *   - authenticated + on the sign-in screen        → /
 * Waits for the session to resolve (`loading`) before doing anything, so the
 * app never flashes the sign-in screen on cold start. Call once in the root layout.
 */
export function useProtectedRoute(): void {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const onSignIn = segments[0] === 'sign-in';

    if (status === 'unauthenticated' && !onSignIn) {
      router.replace(SIGN_IN);
    } else if (status === 'authenticated' && onSignIn) {
      router.replace(HOME);
    }
  }, [status, segments, router]);
}
