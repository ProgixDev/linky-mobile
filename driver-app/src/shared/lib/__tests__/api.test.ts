import { apiPost, ApiError } from '../api';
import { session } from '../session';

jest.mock('../session', () => ({
  session: {
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
  },
}));

const mockSession = session as jest.Mocked<typeof session>;
const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  mockSession.getAccessToken.mockResolvedValue(null);
  mockSession.getRefreshToken.mockResolvedValue(null);
  mockSession.set.mockResolvedValue(undefined);
  mockSession.clear.mockResolvedValue(undefined);
});

describe('apiPost', () => {
  it('sends apikey + Bearer token + an Idempotency-Key and returns the parsed body', async () => {
    mockSession.getAccessToken.mockResolvedValue('access-tok');
    fetchMock.mockResolvedValue(res(200, { ok: 1 }));

    const out = await apiPost<{ ok: number }>({ path: '/x', body: { a: 1 } });

    expect(out).toEqual({ ok: 1 });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/functions/v1/x');
    expect(opts.headers.authorization).toBe('Bearer access-tok');
    expect(opts.headers.apikey).toBeTruthy();
    expect(opts.headers['idempotency-key']).toEqual(expect.any(String));
  });

  it('throws an ApiError carrying the backend code on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(
      res(400, { error: { code: 'INVALID_BODY', message_fr: 'Corps invalide' } }),
    );

    await expect(apiPost({ path: '/x' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'INVALID_BODY',
      message_fr: 'Corps invalide',
    });
  });

  it('refreshes once on 401 then retries the original call (AC-9 plumbing)', async () => {
    mockSession.getAccessToken.mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    mockSession.getRefreshToken.mockResolvedValue('refresh-tok');
    fetchMock
      .mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message_fr: 'x' } }))
      .mockResolvedValueOnce(res(200, { access_token: 'new', refresh_token: 'r2' }))
      .mockResolvedValueOnce(res(200, { ok: 1 }));

    const out = await apiPost<{ ok: number }>({ path: '/x' });

    expect(out).toEqual({ ok: 1 });
    expect(mockSession.set).toHaveBeenCalledWith({ access_token: 'new', refresh_token: 'r2' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('maps a network failure to a NETWORK_ERROR ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(apiPost({ path: '/x', authed: false })).rejects.toBeInstanceOf(ApiError);
  });
});
