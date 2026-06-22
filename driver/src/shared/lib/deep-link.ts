/**
 * Deep-link safety gate.
 *
 * Deep links are an untrusted input: any app can fire `skeleton://…` and links
 * arrive from emails, notifications, and the web. We therefore validate every
 * incoming path against an allowlist of known routes BEFORE the router acts on
 * it, and we never:
 *   - trust a path param for authorization (the server / RLS enforces ownership);
 *   - follow an attacker-supplied URL into a browser/WebView (open-redirect);
 *   - crash on a malformed path.
 *
 * Anything not on the allowlist resolves to a safe fallback route. Wire this up
 * in `src/app/+native-intent.tsx`. See docs/research/01-mobile-security.md §6.
 */

/** Routes a deep link is allowed to resolve to. Keep in sync with `src/app/`. */
const ALLOWED_ROUTES = ['/', '/sign-in', '/account', '/not-found'] as const;

/** Where unknown / malformed / hostile links land. Must be an allowed route. */
export const SAFE_FALLBACK_ROUTE = '/not-found';

/**
 * Normalize an incoming deep-link path to a safe in-app route.
 *
 * Accepts the raw `path` expo-router hands us (which "may not be a valid URL"
 * and must never crash this function). Returns an allowlisted route string.
 */
export function resolveDeepLinkPath(path: string | null | undefined): string {
  try {
    if (!path) return SAFE_FALLBACK_ROUTE;

    // Strip a custom scheme / host if present, keep only the path + query.
    // `skeleton://tasks?x=1` and `/tasks?x=1` both reduce to `/tasks`.
    let rest = path.trim();
    const schemeMatch = rest.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.*)?$/i);
    if (schemeMatch) rest = schemeMatch[1] ?? '/';

    // Drop query/fragment — params are never trusted for routing decisions.
    const pathname = rest.split(/[?#]/)[0] ?? '/';

    // Collapse a trailing slash (except root) for a stable comparison.
    const normalized =
      pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

    return (ALLOWED_ROUTES as readonly string[]).includes(normalized)
      ? normalized
      : SAFE_FALLBACK_ROUTE;
  } catch {
    // A parsing failure must degrade safely, never throw into the router.
    return SAFE_FALLBACK_ROUTE;
  }
}

/**
 * Guard for following an EXTERNAL url (browser / WebView). Only https on an
 * allowlisted host may be opened — defeats open-redirect via deep-link params.
 */
export function isAllowedExternalUrl(url: string, allowedHosts: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && allowedHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}
