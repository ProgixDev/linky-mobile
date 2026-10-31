/**
 * Pure helpers for the wallet screens (no React).
 *
 * The phone rules MIRROR app-mobile/src/lib/gnPhone.ts, and the destination
 * format mirrors app-mobile/app/wallet/retirer.tsx: the Lengopay payout reads it
 * back (_shared/withdrawal-destination.ts) and checks the operator TWICE — label
 * and number prefix — refusing to pay when they disagree. Same string, same rules.
 */

export type Operator = 'Orange Money' | 'MTN Mobile Money';

export const OPERATORS: { id: Operator; short: string }[] = [
  { id: 'Orange Money', short: 'Orange' },
  { id: 'MTN Mobile Money', short: 'MTN' },
];

export function formatGnf(amount: number): string {
  return `${Math.round(amount).toLocaleString('fr-FR')} GNF`;
}

/** Keep digits only; drop a +224 / 224 prefix; 9 digits max. */
export function normalizeGnPhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('224')) d = d.slice(3);
  return d.slice(0, 9);
}

/** « 622551288 » → « 622 55 12 88 », display only. */
export function formatGnPhone(d: string): string {
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

export function isValidGnPhone(d: string): boolean {
  return d.length === 9 && d.startsWith('6');
}

/** Only the prefixes whose operator is established; anything else is 'unknown'. */
export function gnOperator(d: string): 'orange' | 'mtn' | 'unknown' {
  if (!isValidGnPhone(d)) return 'unknown';
  const p = d.slice(0, 2);
  if (p === '61' || p === '62') return 'orange';
  if (p === '66' || p === '67') return 'mtn';
  return 'unknown';
}

/** True when the number clearly belongs to the OTHER operator. */
export function operatorMismatch(operator: Operator, phone: string): boolean {
  const op = gnOperator(phone);
  if (op === 'unknown') return false;
  return (operator === 'Orange Money') !== (op === 'orange');
}

/** The exact string the payout parser expects: « Orange Money — 622 33 44 55 ». */
export function withdrawalDestination(operator: Operator, phone: string): string {
  return `${operator} — ${formatGnPhone(phone)}`;
}

/** Amount typed by the courier: digits only, as an integer (0 when empty). */
export function parseAmount(input: string): number {
  const digits = input.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}
