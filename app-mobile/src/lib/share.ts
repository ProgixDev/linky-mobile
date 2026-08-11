// Public share links (client 2026-08-05 — sharing used to send plain text with
// no link at all, so the recipient had no way to reach the listing).
//
// We share an HTTPS link on the Linky domain rather than the `linky://` custom
// scheme for two reasons:
//   1. Messaging apps (WhatsApp, SMS) only auto-linkify real URLs — a custom
//      scheme is sent as dead text.
//   2. It works for a recipient WITHOUT the app : the web page presents the
//      listing and sends them to the store, which is exactly the "oblige
//      l'installation" behaviour the client asked for.
//
// Once Android App Links / iOS Universal Links are declared in the native
// manifests (needs a NEW BUILD — the marketplace app is bare workflow, app.json
// is ignored for native), the very same link opens the app directly when it is
// installed, with no code change here.

export const SHARE_BASE_URL = 'https://linkygroup.com';

export type ShareKind = 'product' | 'property' | 'shop';

/** Canonical public URL of a listing / shop. Mirrors the landing route /a/[kind]/[id]. */
export function shareUrl(kind: ShareKind, id: string): string {
  return `${SHARE_BASE_URL}/a/${kind}/${id}`;
}

/**
 * Share payload: a short human line followed by the link on its own line, so
 * every messaging client renders it as a tappable URL (and unfurls the preview
 * built from the landing page's OG tags).
 */
export function shareMessage(text: string, kind: ShareKind, id: string): string {
  return `${text}\n\n${shareUrl(kind, id)}`;
}
