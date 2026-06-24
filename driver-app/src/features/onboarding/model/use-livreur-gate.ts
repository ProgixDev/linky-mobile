import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useOnboardingStore } from './store';

// Typed-routes generates the Href union from the filesystem at build/start time; cast the
// literals so a cold `tsc` (before .expo/types regenerates) still type-checks.
const HOME = '/' as Href;
const ONBOARDING = '/onboarding' as Href;

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * The livreur approval gate. Locks every authenticated route behind approval:
 *   - approved (roles include `livreur` OR the status endpoint says `approved`)
 *     → the deliveries home unlocks (and we leave /onboarding or /sign-in).
 *   - not yet approved (none/pending/rejected/unknown) → /onboarding, which renders
 *     the form / pending / rejection screen.
 *
 * Auth state is passed IN (not imported) so the onboarding feature stays free of a
 * cross-feature dependency — the app layer (`_layout`) wires auth → this gate. The
 * signed-out → /sign-in redirect stays in auth's `useProtectedRoute`; the two guards
 * have mutually exclusive conditions (unauthenticated vs authenticated) so never fight.
 */
export function useLivreurGate({
  authStatus,
  roles,
}: {
  authStatus: AuthStatus;
  roles: string[] | undefined;
}): void {
  const appStatus = useOnboardingStore((s) => s.appStatus);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const onOnboarding = segments[0] === 'onboarding';
    const onSignIn = segments[0] === 'sign-in';
    const approved = (roles?.includes('livreur') ?? false) || appStatus === 'approved';

    if (approved) {
      if (onOnboarding || onSignIn) router.replace(HOME);
    } else if (!onOnboarding) {
      router.replace(ONBOARDING);
    }
  }, [authStatus, roles, appStatus, segments, router]);
}
