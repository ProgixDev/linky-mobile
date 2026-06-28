import { fetchDrivingRoute } from '../lib/directions';

const FROM = { lat: 9.5, lng: -13.7 };
const TO = { lat: 9.6, lng: -13.6 };
const LINE: [number, number][] = [
  [-13.7, 9.5],
  [-13.65, 9.55],
  [-13.6, 9.6],
];

// `fetch` is a runtime global in the jest/RN env but isn't typed on the global here.
const g = globalThis as unknown as { fetch: typeof fetch };
const realFetch = g.fetch;

function mockFetch(value: unknown, ok = true) {
  g.fetch = jest.fn().mockResolvedValue({ ok, json: async () => value }) as typeof fetch;
}

afterEach(() => {
  g.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('fetchDrivingRoute', () => {
  it('returns the road geometry, duration and distance on success', async () => {
    mockFetch({ routes: [{ geometry: { coordinates: LINE }, duration: 480, distance: 3200 }] });

    const r = await fetchDrivingRoute(FROM, TO, 'pk.test');

    expect(r).toEqual({ coordinates: LINE, durationSec: 480, distanceM: 3200 });
  });

  it('requests the driving profile with both coordinate pairs', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [] }) });
    g.fetch = spy as typeof fetch;

    await fetchDrivingRoute(FROM, TO, 'pk.test');

    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('/directions/v5/mapbox/driving/-13.7,9.5;-13.6,9.6');
    expect(url).toContain('access_token=pk.test');
  });

  it('returns null (and makes no request) when the token is empty', async () => {
    const spy = jest.fn();
    g.fetch = spy as unknown as typeof fetch;

    expect(await fetchDrivingRoute(FROM, TO, '')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns null on a non-200 response', async () => {
    mockFetch({}, false);
    expect(await fetchDrivingRoute(FROM, TO, 'pk.test')).toBeNull();
  });

  it('returns null when no route is found', async () => {
    mockFetch({ routes: [] });
    expect(await fetchDrivingRoute(FROM, TO, 'pk.test')).toBeNull();
  });

  it('returns null when the geometry has fewer than two points', async () => {
    mockFetch({
      routes: [{ geometry: { coordinates: [[-13.7, 9.5]] }, duration: 1, distance: 1 }],
    });
    expect(await fetchDrivingRoute(FROM, TO, 'pk.test')).toBeNull();
  });

  it('returns null when fetch rejects', async () => {
    g.fetch = jest.fn().mockRejectedValue(new Error('network')) as typeof fetch;
    expect(await fetchDrivingRoute(FROM, TO, 'pk.test')).toBeNull();
  });
});
