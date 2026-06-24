import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect } from 'react';

// Typed-routes Href cast so a cold `tsc` (before .expo/types regenerates) passes.
const WELCOME = '/welcome' as Href;

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * Pre-auth welcome gate. The FIRST launch of a fresh install (welcomeSeen === false)
 * lands on the animated welcome → get-started before sign-in. It only acts while
 * the courier is unauthenticated AND has not seen the welcome; once seen (true) the
 * auth guard (useProtectedRoute) owns the unauth → /sign-in redirect. The two are
 * mutually exclusive on `welcomeSeen`, so they never fight.
 *
 * Auth state + welcomeSeen are passed IN from the root layout so this feature stays
 * free of cross-feature imports (mirrors useLivreurGate).
 */
export function useWelcomeGate({
  authStatus,
  welcomeSeen,
}: {
  authStatus: AuthStatus;
  welcomeSeen: boolean | null;
}): void {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authStatus !== 'unauthenticated') return; // welcome is a pre-auth moment only
    if (welcomeSeen !== false) return; // not while loading (null) or already seen (true)
    const onWelcomeFlow = segments[0] === 'welcome' || segments[0] === 'get-started';
    if (!onWelcomeFlow) router.replace(WELCOME);
  }, [authStatus, welcomeSeen, segments, router]);
}
