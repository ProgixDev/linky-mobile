// Boutique opening-hours helpers. The owner configures a weekly schedule (or a
// 24/24h flag) in shop/edit ; the storefront turns it into a live open/closed
// status + a "24/24h" badge. Guinea is UTC+0, so the device local time is a
// good enough proxy for shop-local time in V1 — no timezone math needed.
import type { ShopHours } from '../data/types';

// JS Date.getDay(): 0 = Sunday … 6 = Saturday.
export const DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// Owner-facing order (Mon first) + French labels.
export const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const DAY_LABELS_FR: Record<string, string> = {
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mer',
  thu: 'Jeu',
  fri: 'Ven',
  sat: 'Sam',
  sun: 'Dim',
};

function parseHM(hm: string): number {
  const [h, m] = (hm || '').split(':').map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

// Is the shop open at `now`? Handles overnight ranges (e.g. 20:00 → 02:00).
export function isShopOpenNow(hours: ShopHours | null | undefined, now: Date = new Date()): boolean {
  if (!hours) return false;
  if (hours.alwaysOpen) return true;
  if (!Array.isArray(hours.days) || hours.days.length === 0) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const openMin = parseHM(hours.open);
  const closeMin = parseHM(hours.close);
  const todayCode = DAY_CODES[now.getDay()];
  const yesterdayCode = DAY_CODES[(now.getDay() + 6) % 7];

  if (closeMin <= openMin) {
    // Overnight window: opens today and runs past midnight into tomorrow.
    // Open if it's an open-day and we're after opening, OR the window that
    // started yesterday is still running (before this morning's close).
    if (hours.days.includes(todayCode) && cur >= openMin) return true;
    if (hours.days.includes(yesterdayCode) && cur < closeMin) return true;
    return false;
  }
  return hours.days.includes(todayCode) && cur >= openMin && cur < closeMin;
}

export interface ShopOpenStatus {
  configured: boolean;   // owner has set any schedule
  is24h: boolean;        // always open
  isOpen: boolean;       // open right now
  // Short French line for the storefront info panel, e.g.
  // "24h/24, 7j/7" or "Lun–Sam · 08:00–20:00".
  scheduleText: string;
}

// Compress a set of day codes into a compact French label. Contiguous runs in
// Mon..Sun order collapse to "Lun–Ven" ; gaps list each run, e.g. "Lun–Ven, Dim".
function formatDays(days: string[]): string {
  const present = WEEK_ORDER.filter((d) => days.includes(d));
  if (present.length === 0) return '';
  if (present.length === 7) return '7j/7';
  const runs: string[] = [];
  let start = 0;
  for (let i = 1; i <= present.length; i++) {
    const prevIdx = WEEK_ORDER.indexOf(present[i - 1]);
    const curIdx = i < present.length ? WEEK_ORDER.indexOf(present[i]) : -99;
    if (curIdx !== prevIdx + 1) {
      const a = DAY_LABELS_FR[present[start]];
      const b = DAY_LABELS_FR[present[i - 1]];
      runs.push(i - 1 === start ? a : `${a}–${b}`);
      start = i;
    }
  }
  return runs.join(', ');
}

export function shopOpenStatus(hours: ShopHours | null | undefined, now: Date = new Date()): ShopOpenStatus {
  if (!hours) {
    return { configured: false, is24h: false, isOpen: false, scheduleText: '' };
  }
  if (hours.alwaysOpen) {
    return { configured: true, is24h: true, isOpen: true, scheduleText: '24h/24, 7j/7' };
  }
  const daysText = formatDays(hours.days);
  const hasWindow = daysText && hours.open && hours.close;
  return {
    configured: !!hasWindow,
    is24h: false,
    isOpen: isShopOpenNow(hours, now),
    scheduleText: hasWindow ? `${daysText} · ${hours.open}–${hours.close}` : '',
  };
}
