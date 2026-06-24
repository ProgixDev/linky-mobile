import { session } from '@/shared/lib/session';

import { requestOtp, verifyOtp, refreshSession } from '../lib/auth-api';
import { useAuthStore } from '../model/store';

jest.mock('@/shared/lib/session', () => ({
  session: {
    set: jest.fn(),
    clear: jest.fn(),
    getRefreshToken: jest.fn(),
    getAccessToken: jest.fn(),
  },
}));

jest.mock('../lib/auth-api', () => ({
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
  refreshSession: jest.fn(),
}));

const mockSession = session as jest.Mocked<typeof session>;
const mockRequestOtp = requestOtp as jest.Mock;
const mockVerifyOtp = verifyOtp as jest.Mock;
const mockRefreshSession = refreshSession as jest.Mock;

const bundle = {
  access_token: 'a.b.c',
  refresh_token: 'sess.secret',
  user: { id: 'u1', display_name: 'Driver', roles: ['livreur'] },
  was_created: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.set.mockResolvedValue(undefined);
  mockSession.clear.mockResolvedValue(undefined);
  useAuthStore.setState({
    status: 'loading',
    user: null,
    error: null,
    otpId: null,
    pendingEmail: null,
    devCode: null,
  });
});

describe('requestCode (step 1)', () => {
  it('rejects an invalid email client-side without hitting the network', async () => {
    const result = await useAuthStore.getState().requestCode('not-an-email');

    expect(result.ok).toBe(false);
    expect(mockRequestOtp).not.toHaveBeenCalled();
    expect(useAuthStore.getState().otpId).toBeNull();
  });

  it('stores the otp_id + dev_code and the pending email on success', async () => {
    mockRequestOtp.mockResolvedValue({ ok: true, otpId: 'otp-1', devCode: '123456' });

    const result = await useAuthStore.getState().requestCode('  driver@example.com ');

    expect(result).toEqual({ ok: true });
    expect(mockRequestOtp).toHaveBeenCalledWith({ email: 'driver@example.com' });
    const s = useAuthStore.getState();
    expect(s.otpId).toBe('otp-1');
    expect(s.pendingEmail).toBe('driver@example.com');
    expect(s.devCode).toBe('123456');
    expect(s.error).toBeNull();
  });

  it('surfaces a rate-limit message and stays on the email step', async () => {
    mockRequestOtp.mockResolvedValue({
      ok: false,
      kind: 'rate_limited',
      message: 'Trop de demandes.',
    });

    const result = await useAuthStore.getState().requestCode('driver@example.com');

    expect(result).toEqual({ ok: false, error: 'Trop de demandes.' });
    expect(useAuthStore.getState().otpId).toBeNull();
    expect(useAuthStore.getState().error).toBe('Trop de demandes.');
  });
});

describe('verifyCode (step 2)', () => {
  beforeEach(() => {
    useAuthStore.setState({ otpId: 'otp-1', pendingEmail: 'driver@example.com' });
  });

  it('verifies a valid code: persists tokens, caches the user, becomes authenticated', async () => {
    mockVerifyOtp.mockResolvedValue({ ok: true, bundle });

    const result = await useAuthStore.getState().verifyCode('123456');

    expect(result).toEqual({ ok: true });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ otpId: 'otp-1', code: '123456' });
    expect(mockSession.set).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'a.b.c', refresh_token: 'sess.secret' }),
    );
    const s = useAuthStore.getState();
    expect(s.status).toBe('authenticated');
    expect(s.user?.id).toBe('u1');
    expect(s.otpId).toBeNull(); // transient OTP state cleared
  });

  it('rejects a malformed code client-side', async () => {
    const result = await useAuthStore.getState().verifyCode('12'); // not 6 digits

    expect(result.ok).toBe(false);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('surfaces an invalid-code error and does NOT store a session', async () => {
    mockVerifyOtp.mockResolvedValue({ ok: false, kind: 'invalid', message: 'Code incorrect' });

    const result = await useAuthStore.getState().verifyCode('000000');

    expect(result).toEqual({ ok: false, error: 'Code incorrect' });
    expect(mockSession.set).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('surfaces an expired-code error', async () => {
    mockVerifyOtp.mockResolvedValue({ ok: false, kind: 'expired', message: 'Code expiré' });

    expect(await useAuthStore.getState().verifyCode('000000')).toEqual({
      ok: false,
      error: 'Code expiré',
    });
  });

  it('surfaces an offline error (money/auth stays online)', async () => {
    mockVerifyOtp.mockResolvedValue({
      ok: false,
      kind: 'offline',
      message: 'Connexion impossible.',
    });

    expect(await useAuthStore.getState().verifyCode('000000')).toEqual({
      ok: false,
      error: 'Connexion impossible.',
    });
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('refuses to verify with no otp_id (must request a code first)', async () => {
    useAuthStore.setState({ otpId: null });

    const result = await useAuthStore.getState().verifyCode('123456');

    expect(result.ok).toBe(false);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });
});

describe('resendCode', () => {
  it('re-requests an OTP for the pending email', async () => {
    useAuthStore.setState({ otpId: 'old', pendingEmail: 'driver@example.com' });
    mockRequestOtp.mockResolvedValue({ ok: true, otpId: 'otp-2' });

    const result = await useAuthStore.getState().resendCode();

    expect(result).toEqual({ ok: true });
    expect(mockRequestOtp).toHaveBeenCalledWith({ email: 'driver@example.com' });
    expect(useAuthStore.getState().otpId).toBe('otp-2');
  });
});

describe('session lifecycle', () => {
  it('init with a stored refresh token rehydrates an authenticated session', async () => {
    mockSession.getRefreshToken.mockResolvedValue('sess.secret');
    mockRefreshSession.mockResolvedValue({ access_token: 'a2', refresh_token: 'r2' });

    await useAuthStore.getState().init();

    expect(mockSession.set).toHaveBeenCalledWith({ access_token: 'a2', refresh_token: 'r2' });
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('init with no refresh token lands unauthenticated', async () => {
    mockSession.getRefreshToken.mockResolvedValue(null);

    await useAuthStore.getState().init();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('init clears the session when refresh fails', async () => {
    mockSession.getRefreshToken.mockResolvedValue('sess.secret');
    mockRefreshSession.mockRejectedValue(new Error('invalid'));

    await useAuthStore.getState().init();

    expect(mockSession.clear).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('signOut clears secure-storage tokens and becomes unauthenticated', async () => {
    useAuthStore.setState({ status: 'authenticated', user: bundle.user });

    await useAuthStore.getState().signOut();

    expect(mockSession.clear).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
  });
});
