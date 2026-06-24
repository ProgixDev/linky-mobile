/**
 * Availability model + serialization for the courier application.
 *
 * The backend stores `answers.availability` as a human STRING (≤500 chars), so we
 * serialize to e.g. « Lun–Sam · 08:00–18:00 », and also keep a structured
 * `{ days, start, end }` under `answers.availability_data` for future use (the
 * answers jsonb accepts the extra key — no backend change).
 */

export type DayKey = 'lun' | 'mar' | 'mer' | 'jeu' | 'ven' | 'sam' | 'dim';

export const DAYS: { key: DayKey; chip: string; label: string }[] = [
  { key: 'lun', chip: 'Lu', label: 'Lun' },
  { key: 'mar', chip: 'Ma', label: 'Mar' },
  { key: 'mer', chip: 'Me', label: 'Mer' },
  { key: 'jeu', chip: 'Je', label: 'Jeu' },
  { key: 'ven', chip: 'Ve', label: 'Ven' },
  { key: 'sam', chip: 'Sa', label: 'Sam' },
  { key: 'dim', chip: 'Di', label: 'Dim' },
];

const ORDER: DayKey[] = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const LABEL: Record<DayKey, string> = Object.fromEntries(
  DAYS.map((d) => [d.key, d.label]),
) as Record<DayKey, string>;

export type Availability = { days: DayKey[]; start: string; end: string };

export type AvailabilityPreset = { key: string; label: string; start: string; end: string };
export const PRESETS: AvailabilityPreset[] = [
  { key: 'journee', label: 'Journée', start: '08:00', end: '18:00' },
  { key: 'matinee', label: 'Matinée', start: '06:00', end: '12:00' },
  { key: 'soiree', label: 'Soirée', start: '16:00', end: '22:00' },
  { key: 'flexible', label: 'Flexible', start: '00:00', end: '23:59' },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Compress selected days into a compact human label, e.g. ['lun'..'sam'] → "Lun–Sam". */
export function serializeDays(days: DayKey[]): string {
  const selected = new Set(days);
  if (selected.size === 0) return '';
  if (ORDER.every((d) => selected.has(d))) return 'Tous les jours';
  // Iterate days in week order: consecutive selected days form a run; an
  // unselected day breaks (flushes) the current run.
  const runs: string[] = [];
  let runStart: DayKey | null = null;
  let runEnd: DayKey | null = null;
  const flush = () => {
    if (runStart === null || runEnd === null) return;
    runs.push(runStart === runEnd ? LABEL[runStart] : `${LABEL[runStart]}–${LABEL[runEnd]}`);
    runStart = null;
    runEnd = null;
  };
  for (const d of ORDER) {
    if (selected.has(d)) {
      if (runStart === null) runStart = d;
      runEnd = d;
    } else {
      flush();
    }
  }
  flush();
  return runs.join(', ');
}

/** Human string for answers.availability, e.g. « Lun–Sam · 08:00–18:00 ». */
export function serializeAvailability(a: Availability): string {
  const days = serializeDays(a.days);
  if (!days) return '';
  return `${days} · ${a.start}–${a.end}`;
}

export function isValidAvailability(a: Availability | null | undefined): a is Availability {
  return (
    !!a && a.days.length > 0 && TIME_RE.test(a.start) && TIME_RE.test(a.end) && a.start < a.end // lexicographic works for zero-padded HH:MM
  );
}

/** Add minutes to an "HH:MM" time, clamped to [00:00, 23:59]. */
export function shiftTime(time: string, deltaMin: number): string {
  if (!TIME_RE.test(time)) return time;
  const parts = time.split(':');
  const minutes = Number(parts[0]) * 60 + Number(parts[1]) + deltaMin;
  const total = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hh = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}
