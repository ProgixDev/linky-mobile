import {
  formatRemaining,
  getDeadline,
  isSameDay,
  isUrgent,
  remainingMs,
  SLA_HOURS,
  urgency,
} from '../lib/deadline';

const HOUR = 60 * 60 * 1000;

describe('deadline helpers', () => {
  it('derives the deadline as createdAt + SLA', () => {
    expect(getDeadline({ createdAt: 0 })).toBe(SLA_HOURS * HOUR);
  });

  it('bands urgency from remaining time (amber → red)', () => {
    expect(urgency(5 * HOUR)).toBe('normal');
    expect(urgency(90 * 60 * 1000)).toBe('soon'); // 1h30 left
    expect(urgency(20 * 60 * 1000)).toBe('urgent'); // 20m left
    expect(urgency(-1)).toBe('overdue');
  });

  it('formats remaining time compactly', () => {
    expect(formatRemaining(HOUR + 42 * 60 * 1000)).toBe('1h 42m');
    expect(formatRemaining(27 * 60 * 1000)).toBe('27m');
    expect(formatRemaining(0)).toBe('En retard');
  });

  it('flags urgent (≤ 1h or overdue)', () => {
    const now = 1_000_000;
    expect(isUrgent(now + 30 * 60 * 1000, now)).toBe(true);
    expect(isUrgent(now + 3 * HOUR, now)).toBe(false);
    expect(isUrgent(now - HOUR, now)).toBe(true);
  });

  it('detects same calendar day', () => {
    const a = new Date(2026, 5, 24, 9, 0).getTime();
    const b = new Date(2026, 5, 24, 23, 0).getTime();
    const c = new Date(2026, 5, 25, 1, 0).getTime();
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });

  it('computes remaining as deadline - now', () => {
    expect(remainingMs(500, 200)).toBe(300);
  });
});
