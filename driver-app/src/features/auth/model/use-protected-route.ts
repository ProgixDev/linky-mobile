import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useAuthStore } from './store';

// Typed-routes (`experiments.typedRoutes`) generates the Href union from the
// filesystem at Expo build/start time. We cast this literal so a cold `tsc`
// (before `.expo/types` regenerates to include /sign-in) still type-checks.
const SIGN_IN = '/sign-in' as Href;

/**
 * Auth-only route guard: an unauthenticated user anywhere but the sign-in screen is
 * sent to /sign-in. It deliberately does NOT route authenticated users — where a
 * signed-in courier lands (deliveries home vs the onboarding/approval gate) is decided
 * by the livreur gate (`useLivreurGate`, wired in the root layout). The two guards have
 * mutually exclusive conditions (unauthenticated vs authenticated) so they never fight.
 * Waits for the session to resolve (`loading`) so the app never flashes sign-in on cold
 * start. Call once in the root layout.
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
    }
  }, [status, segments, router]);
}
