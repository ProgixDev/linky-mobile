import {
  isValidAvailability,
  serializeAvailability,
  serializeDays,
  shiftTime,
  type DayKey,
} from '../lib/availability';

describe('availability serialization', () => {
  it('compresses consecutive days into ranges', () => {
    expect(serializeDays(['lun', 'mar', 'mer', 'jeu', 'ven', 'sam'])).toBe('Lun–Sam');
    expect(serializeDays(['lun', 'mer', 'ven'])).toBe('Lun, Mer, Ven');
    expect(serializeDays(['lun', 'mar', 'jeu', 'ven'])).toBe('Lun–Mar, Jeu–Ven');
    expect(serializeDays(['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'])).toBe('Tous les jours');
    expect(serializeDays([])).toBe('');
  });

  it('is order-independent on the input', () => {
    const d: DayKey[] = ['ven', 'lun', 'mar'];
    expect(serializeDays(d)).toBe('Lun–Mar, Ven');
  });

  it('serializes the full availability string', () => {
    expect(
      serializeAvailability({
        days: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam'],
        start: '08:00',
        end: '18:00',
      }),
    ).toBe('Lun–Sam · 08:00–18:00');
    expect(serializeAvailability({ days: [], start: '08:00', end: '18:00' })).toBe('');
  });

  it('validates days + a real time window', () => {
    expect(isValidAvailability({ days: ['lun'], start: '08:00', end: '18:00' })).toBe(true);
    expect(isValidAvailability({ days: [], start: '08:00', end: '18:00' })).toBe(false);
    expect(isValidAvailability({ days: ['lun'], start: '18:00', end: '08:00' })).toBe(false);
    expect(isValidAvailability(null)).toBe(false);
  });

  it('shiftTime moves by minutes and clamps to the day', () => {
    expect(shiftTime('08:00', 30)).toBe('08:30');
    expect(shiftTime('08:15', -30)).toBe('07:45');
    expect(shiftTime('00:00', -30)).toBe('00:00');
    expect(shiftTime('23:59', 30)).toBe('23:59');
  });
});
