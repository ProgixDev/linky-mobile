import { ApiError, apiPost, toToastMessage } from '../api';
import { session } from '../session';

// The token store is mocked so the 401→refresh→retry path is observable without
// touching the Keychain.
jest.mock('../session', () => ({
  session: {
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
  },
}));

// Silence the redacting logger's expected error lines (non-2xx / refresh-fail paths).
jest.mock('../logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockSession = session as jest.Mocked<typeof session>;
const fetchMock = jest.fn();
// @ts-expect-error -- assign the test double onto the global.
global.fetch = fetchMock;

function res(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  mockSession.getAccessToken.mockReset().mockResolvedValue(null);
  mockSession.getRefreshToken.mockReset().mockResolvedValue(null);
  mockSession.set.mockReset().mockResolvedValue(undefined);
  mockSession.clear.mockReset().mockResolvedValue(undefined);
});

describe('apiPost headers', () => {
  it('sends apikey + an Idempotency-Key and the user Bearer when authed', async () => {
    mockSession.getAccessToken.mockResolvedValue('access-123');
    fetchMock.mockResolvedValueOnce(res(200, { ok: true }));

    await apiPost({ path: '/list-livreur-deliveries' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/functions\/v1\/list-livreur-deliveries$/);
    expect(init.method).toBe('POST');
    expect(init.headers.apikey).toBeTruthy();
    expect(init.headers.authorization).toBe('Bearer access-123');
    expect(init.headers['idempotency-key']).toBeTruthy();
  });

  it('uses the anon key as Bearer when unauthed (auth endpoints)', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { otp_id: 'o1' }));

    await apiPost({ path: '/otp-request', authed: false, body: { target: 'x' } });

    const [, init] = fetchMock.mock.calls[0];
    // Unauthed → the Bearer is the anon key itself (which is also the apikey header).
    expect(init.headers.authorization).toBe(`Bearer ${init.headers.apikey}`);
    expect(mockSession.getAccessToken).not.toHaveBeenCalled();
  });

  it('forwards a stable Idempotency-Key when provided', async () => {
    fetchMock.mockResolvedValueOnce(res(200, {}));

    await apiPost({ path: '/livreur-confirm-handoff', idempotencyKey: 'idem-1' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['idempotency-key']).toBe('idem-1');
  });
});

describe('apiPost responses', () => {
  it('returns the parsed JSON body on 2xx', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { hello: 'world' }));

    const out = await apiPost<{ hello: string }>({ path: '/x', authed: false });

    expect(out).toEqual({ hello: 'world' });
  });

  it('throws ApiError with the backend code + French message on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      res(429, { error: { code: 'OTP_RATE_LIMITED', message_fr: 'Trop de demandes.' } }),
    );

    await expect(apiPost({ path: '/otp-request', authed: false })).rejects.toMatchObject({
      status: 429,
      code: 'OTP_RATE_LIMITED',
      message_fr: 'Trop de demandes.',
    });
  });

  it('maps a transport failure to a NETWORK_ERROR ApiError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiPost({ path: '/x', authed: false })).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });
});

describe('apiPost 401 → refresh → retry', () => {
  it('refreshes once and retries the original call with the new token', async () => {
    mockSession.getAccessToken
      .mockResolvedValueOnce('stale') // first attempt
      .mockResolvedValueOnce('fresh'); // retry after refresh
    mockSession.getRefreshToken.mockResolvedValue('refresh-tok');
    fetchMock
      .mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message_fr: 'x' } })) // original
      .mockResolvedValueOnce(res(200, { access_token: 'fresh', refresh_token: 'r2' })) // refresh
      .mockResolvedValueOnce(res(200, { ok: true })); // retry

    const out = await apiPost<{ ok: boolean }>({ path: '/get-delivery' });

    expect(out).toEqual({ ok: true });
    expect(mockSession.set).toHaveBeenCalledWith({ access_token: 'fresh', refresh_token: 'r2' });
    // refresh fetch + retry fetch both fired.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retryHeaders = fetchMock.mock.calls[2][1].headers;
    expect(retryHeaders.authorization).toBe('Bearer fresh');
  });

  it('clears the session and surfaces the 401 when refresh fails', async () => {
    mockSession.getAccessToken.mockResolvedValue('stale');
    mockSession.getRefreshToken.mockResolvedValue('refresh-tok');
    fetchMock
      .mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message_fr: 'x' } })) // original
      .mockResolvedValueOnce(
        res(401, { error: { code: 'REFRESH_TOKEN_INVALID', message_fr: 'y' } }),
      ); // refresh fails

    await expect(apiPost({ path: '/get-delivery' })).rejects.toBeInstanceOf(ApiError);
    expect(mockSession.clear).toHaveBeenCalled();
  });

  it('does not attempt a refresh when there is no refresh token', async () => {
    mockSession.getAccessToken.mockResolvedValue('stale');
    mockSession.getRefreshToken.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message_fr: 'x' } }));

    await expect(apiPost({ path: '/get-delivery' })).rejects.toMatchObject({ status: 401 });
    expect(mockSession.set).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('toToastMessage', () => {
  it('prefers an ApiError French message, falling back otherwise', () => {
    expect(toToastMessage(new ApiError(400, { code: 'X', message_fr: 'Oops' }), 'fb')).toBe('Oops');
    expect(toToastMessage({}, 'fallback')).toBe('fallback');
  });
});
