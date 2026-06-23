/**
 * Parse the buyer's on-screen order QR at handoff.
 *
 * The Linky consumer app renders `linky://order/<order_id>/confirm?token=<scan_token>`.
 * The scanned string is an untrusted trust boundary (SEC-INPUT-001): a forged or
 * malformed payload must be rejected here, before any network call. We validate the
 * exact scheme/path/shape and that both ids are real UUIDs; anything else returns
 * `null` so the scanner can show a "doesn't match" error (AC-5). The server is still
 * the source of truth — it re-checks the token, assignment, and status — but parsing
 * strictly keeps junk off the wire and lets the UI compare the scanned order to the
 * opened delivery before confirming.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Anchored, scheme + path + single `token` query, captures order id and token.
const QR_RE = /^linky:\/\/order\/([^/?#]+)\/confirm\?token=([^&?#]+)$/i;

export interface ParsedOrderQr {
  orderId: string;
  scanToken: string;
}

export function parseOrderQr(raw: unknown): ParsedOrderQr | null {
  if (typeof raw !== 'string') return null;
  const match = QR_RE.exec(raw.trim());
  if (!match) return null;
  const [, orderId, scanToken] = match;
  if (!UUID_RE.test(orderId) || !UUID_RE.test(scanToken)) return null;
  return { orderId, scanToken };
}
