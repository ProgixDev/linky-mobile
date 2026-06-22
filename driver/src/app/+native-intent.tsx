import { resolveDeepLinkPath } from '@/shared/lib/deep-link';

/**
 * Native deep-link entry point (expo-router).
 *
 * Runs OUTSIDE React for every incoming deep / universal link before the router
 * navigates. It must never crash (a thrown error here can crash app launch), so
 * all validation lives in `resolveDeepLinkPath`, which allowlists routes and
 * falls back safely. See docs/research/01-mobile-security.md §6.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return resolveDeepLinkPath(path);
}
