/**
 * Logger with automatic secret/PII redaction.
 *
 * AI-written code (and humans) routinely log whole objects — including auth
 * sessions, tokens, and headers — which then leak into Sentry, device logs, and
 * crash reports. This logger redacts known-sensitive keys and token-shaped
 * values before anything is emitted. Use it instead of `console.*` for anything
 * that might touch user/auth/network data.
 *
 * See docs/research/01-mobile-security.md §5 (redact tokens from every logger).
 */

const SENSITIVE_KEY =
  /(token|secret|password|passwd|authorization|auth|api[-_]?key|refresh|session|cookie|credential|ssn|email|phone)/i;

// JWT-shaped and common secret-prefixed values.
const SENSITIVE_VALUE = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
  /\bsk_(live|test)_[A-Za-z0-9]{8,}\b/g, // Stripe secret
  /\bsb_secret_[A-Za-z0-9_-]{8,}\b/g, // Supabase secret key
];

const REDACTED = '[redacted]';

function redactString(value: string): string {
  return SENSITIVE_VALUE.reduce((acc, re) => acc.replace(re, REDACTED), value);
}

/** Deep-redact a value: sensitive keys are masked, token-shaped strings scrubbed. */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => redact(v, seen));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, seen);
  }
  return out;
}

function emit(level: 'log' | 'warn' | 'error', args: unknown[]): void {
  // The logger is the sanctioned console wrapper (no-console is not enabled in
  // eslint-config-expo@10; re-add an eslint-disable here if it ever is).
  console[level](...args.map((a) => redact(a)));
}

export const logger = {
  debug: (...args: unknown[]) => emit('log', args),
  info: (...args: unknown[]) => emit('log', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
} as const;
