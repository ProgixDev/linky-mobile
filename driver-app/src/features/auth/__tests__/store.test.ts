import { ApiError, apiPost } from '@/shared/lib/api';
import { session } from '@/shared/lib/session';

import { useAuthStore } from '../model/store';

// Real ApiError class so the store's `instanceof ApiError` branch works.
jest.mock('@/shared/lib/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    message_fr: string;
    constructor(status: number, body: { code: string; message_fr: string }) {
      super(body.message_fr);
      this.name = 'ApiError';
      this.status = status;
      this.code = body.code;
      this.message_fr = body.message_fr;
    }
  }
  return { apiPost: jest.fn(), ApiError };
});

jest.mock('@/shared/lib/session', () => ({
  session: {
    set: jest.fn(),
    clear: jest.fn(),
    getRefreshToken: jest.fn(),
    getAccessToken: jest.fn(),
  },
}));

const mockApiPost = apiPost as jest.Mock;
const mockSession = session as jest.Mocked<typeof session>;

const bundle = {
  access_token: 'a',
  refresh_token: 'r',
  user: { id: 'u1', display_name: 'Driver', roles: ['livreur'] },
};

beforeEach(() => {
  mockApiPost.mockReset();
  mockSession.set.mockResolvedValue(undefined);
  mockSession.clear.mockResolvedValue(undefined);
  useAuthStore.setState({ status: 'loading', user: null, error: null });
});

describe('auth store', () => {
  it('signs in: persists tokens, caches the user, becomes authenticated', async () => {
    mockApiPost.mockResolvedValue(bundle);

    const result = await useAuthStore.getState().signIn('driver@example.com', 'password1');

    expect(result).toEqual({ ok: true });
    expect(mockApiPost).toHaveBeenCalledWith({
      path: '/email-signin',
      body: { email: 'driver@example.com', password: 'password1' },
      authed: false,
    });
    expect(mockSession.set).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'a', refresh_token: 'r' }),
    );
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user?.id).toBe('u1');
  });

  it('rejects invalid credentials client-side without hitting the network', async () => {
    const result = await useAuthStore.getState().signIn('not-an-email', 'short');

    expect(result.ok).toBe(false);
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('surfaces the backend message on a failed sign-in', async () => {
    mockApiPost.mockRejectedValue(
      new ApiError(401, { code: 'INVALID_CREDENTIALS', message_fr: 'Identifiants invalides' }),
    );

    const result = await useAuthStore.getState().signIn('driver@example.com', 'password1');

    expect(result).toEqual({ ok: false, error: 'Identifiants invalides' });
    expect(mockSession.set).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('signs out: clears tokens and becomes unauthenticated', async () => {
    useAuthStore.setState({ status: 'authenticated', user: bundle.user });

    await useAuthStore.getState().signOut();

    expect(mockSession.clear).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
  });
});
