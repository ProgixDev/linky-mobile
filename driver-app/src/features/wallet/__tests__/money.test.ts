import {
  formatGnPhone,
  gnOperator,
  isValidGnPhone,
  normalizeGnPhone,
  operatorMismatch,
  parseAmount,
  withdrawalDestination,
} from '../lib/money';

describe('wallet money helpers', () => {
  it('normalizes a Guinean number typed with +224 and spaces', () => {
    expect(normalizeGnPhone('+224 622 33 44 55')).toBe('622334455');
    expect(normalizeGnPhone('224622334455')).toBe('622334455');
  });

  it('formats and validates', () => {
    expect(formatGnPhone('622334455')).toBe('622 33 44 55');
    expect(isValidGnPhone('622334455')).toBe(true);
    expect(isValidGnPhone('522334455')).toBe(false);
    expect(isValidGnPhone('62233445')).toBe(false);
  });

  it('knows the established operator prefixes only', () => {
    expect(gnOperator('622334455')).toBe('orange');
    expect(gnOperator('610574736')).toBe('orange');
    expect(gnOperator('660698848')).toBe('mtn');
    expect(gnOperator('655000000')).toBe('unknown');
  });

  it('flags a number that belongs to the other operator, never an unknown one', () => {
    expect(operatorMismatch('Orange Money', '660698848')).toBe(true);
    expect(operatorMismatch('MTN Mobile Money', '622334455')).toBe(true);
    expect(operatorMismatch('Orange Money', '622334455')).toBe(false);
    expect(operatorMismatch('MTN Mobile Money', '655000000')).toBe(false);
  });

  it('builds the exact destination the payout parser reads', () => {
    expect(withdrawalDestination('Orange Money', '622334455')).toBe('Orange Money — 622 33 44 55');
  });

  it('parses a typed amount, grouping spaces included', () => {
    expect(parseAmount('15 000')).toBe(15000);
    expect(parseAmount('')).toBe(0);
  });
});
