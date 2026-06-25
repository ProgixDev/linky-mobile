import { boundsOf, formatDistanceKm, haversineKm } from '../lib/geo';

describe('haversineKm', () => {
  it('is ~0 for the same point', () => {
    expect(haversineKm({ lat: 9.6, lng: -13.6 }, { lat: 9.6, lng: -13.6 })).toBeCloseTo(0, 5);
  });

  it('computes a known distance (Conakry ~ 1° lat ≈ 111 km)', () => {
    const d = haversineKm({ lat: 9.5, lng: -13.7 }, { lat: 10.5, lng: -13.7 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('is symmetric', () => {
    const a = { lat: 9.51, lng: -13.71 };
    const b = { lat: 9.64, lng: -13.58 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});

describe('formatDistanceKm', () => {
  it('uses metres under 1 km', () => {
    expect(formatDistanceKm(0.42)).toBe('420 m');
  });

  it('uses one decimal of km at/above 1 km', () => {
    expect(formatDistanceKm(3.24)).toBe('3,2 km'); // fr-FR decimal comma
  });

  it('guards against non-finite / negative input', () => {
    expect(formatDistanceKm(NaN)).toBe('—');
    expect(formatDistanceKm(-1)).toBe('—');
  });
});

describe('boundsOf', () => {
  it('returns null for no points', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('pads a single point so the camera does not over-zoom', () => {
    const b = boundsOf([{ lat: 9.5, lng: -13.7 }]);
    expect(b).not.toBeNull();
    // ne is [lng, lat] and strictly greater than sw on both axes.
    expect(b!.ne[0]).toBeGreaterThan(b!.sw[0]);
    expect(b!.ne[1]).toBeGreaterThan(b!.sw[1]);
  });

  it('fits all supplied points (ne >= max, sw <= min)', () => {
    const b = boundsOf([
      { lat: 9.5, lng: -13.7 },
      { lat: 9.64, lng: -13.58 },
    ])!;
    expect(b.ne[1]).toBeGreaterThanOrEqual(9.64);
    expect(b.sw[1]).toBeLessThanOrEqual(9.5);
    expect(b.ne[0]).toBeGreaterThanOrEqual(-13.58);
    expect(b.sw[0]).toBeLessThanOrEqual(-13.7);
  });
});
