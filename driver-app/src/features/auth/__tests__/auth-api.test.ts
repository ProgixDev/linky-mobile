import { ApiError, apiPost } from '@/shared/lib/api';

import { refreshSession, requestOtp, verifyOtp } from '../lib/auth-api';

// Real ApiError class so the lib's `instanceof ApiError` mapping works.
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

const mockApiPost = apiPost as jest.Mock;
const apiErr = (status: number, code: string, message_fr = '') =>
  new ApiError(status, { code, message_fr });

beforeEach(() => mockApiPost.mockReset());

describe('requestOtp', () => {
  it('posts an email OTP request with NO bearer token and returns otpId + devCode', async () => {
    mockApiPost.mockResolvedValue({ otp_id: 'otp-1', dev_code: '123456' });

    const result = await requestOtp({ email: 'driver@example.com' });

    expect(mockApiPost).toHaveBeenCalledWith({
      path: '/otp-request',
      authed: false,
      body: { channel: 'email', target: 'driver@example.com', purpose: 'signin' },
    });
    expect(result).toEqual({ ok: true, otpId: 'otp-1', devCode: '123456' });
  });

  it('omits devCode in real-delivery mode (no dev_code field)', async () => {
    mockApiPost.mockResolvedValue({ otp_id: 'otp-2' });

    const result = await requestOtp({ email: 'driver@example.com' });

    expect(result).toEqual({ ok: true, otpId: 'otp-2', devCode: undefined });
  });

  it('maps a rate-limit to the typed kind with the server message', async () => {
    mockApiPost.mockRejectedValue(apiErr(429, 'OTP_RATE_LIMITED', 'Trop de demandes.'));

    const result = await requestOtp({ email: 'driver@example.com' });

    expect(result).toEqual({ ok: false, kind: 'rate_limited', message: 'Trop de demandes.' });
  });

  it('maps a delivery failure', async () => {
    mockApiPost.mockRejectedValue(apiErr(502, 'OTP_DELIVERY_FAILED', 'Envoi impossible.'));

    expect(await requestOtp({ email: 'x@e.com' })).toEqual({
      ok: false,
      kind: 'delivery_failed',
      message: 'Envoi impossible.',
    });
  });

  it('maps a transport failure to offline', async () => {
    mockApiPost.mockRejectedValue(apiErr(0, 'NETWORK_ERROR', 'Connexion impossible'));

    expect((await requestOtp({ email: 'x@e.com' })).ok).toBe(false);
    const r = await requestOtp({ email: 'x@e.com' });
    expect(r).toMatchObject({ ok: false, kind: 'offline' });
  });

  it('treats an unexpected payload as a generic error (no false otpId)', async () => {
    mockApiPost.mockResolvedValue({ nope: true });

    expect(await requestOtp({ email: 'x@e.com' })).toMatchObject({ ok: false, kind: 'error' });
  });
});

describe('verifyOtp', () => {
  const bundle = {
    access_token: 'a.b.c',
    refresh_token: 'sess.secret',
    user: { id: 'u1', display_name: 'Driver', roles: ['livreur'] },
    was_created: false,
  };

  it('posts the otp_id + code (no bearer) and returns the validated bundle', async () => {
    mockApiPost.mockResolvedValue(bundle);

    const result = await verifyOtp({ otpId: 'otp-1', code: '123456' });

    expect(mockApiPost).toHaveBeenCalledWith({
      path: '/otp-verify',
      authed: false,
      body: { otp_id: 'otp-1', code: '123456' },
    });
    expect(result).toEqual({ ok: true, bundle });
  });

  it('maps a wrong code to invalid', async () => {
    mockApiPost.mockRejectedValue(apiErr(401, 'OTP_INVALID', 'Code incorrect'));

    expect(await verifyOtp({ otpId: 'o', code: '000000' })).toEqual({
      ok: false,
      kind: 'invalid',
      message: 'Code incorrect',
    });
  });

  it('maps an expired or already-used code to expired', async () => {
    mockApiPost.mockRejectedValue(apiErr(410, 'OTP_EXPIRED', 'Code expiré'));
    expect(await verifyOtp({ otpId: 'o', code: '000000' })).toMatchObject({ kind: 'expired' });

    mockApiPost.mockRejectedValue(apiErr(410, 'OTP_ALREADY_USED', 'Code déjà utilisé'));
    expect(await verifyOtp({ otpId: 'o', code: '000000' })).toMatchObject({ kind: 'expired' });
  });

  it('maps too-many-attempts and not-found', async () => {
    mockApiPost.mockRejectedValue(apiErr(429, 'OTP_TOO_MANY_ATTEMPTS', 'Trop de tentatives'));
    expect(await verifyOtp({ otpId: 'o', code: '000000' })).toMatchObject({
      kind: 'too_many_attempts',
    });

    mockApiPost.mockRejectedValue(apiErr(404, 'OTP_NOT_FOUND', 'Code introuvable'));
    expect(await verifyOtp({ otpId: 'o', code: '000000' })).toMatchObject({ kind: 'not_found' });
  });

  it('rejects an unexpected success payload (never a false sign-in)', async () => {
    mockApiPost.mockResolvedValue({ access_token: 'a' }); // missing refresh_token + user

    expect(await verifyOtp({ otpId: 'o', code: '123456' })).toMatchObject({
      ok: false,
      kind: 'error',
    });
  });
});

describe('refreshSession', () => {
  it('rotates the token pair', async () => {
    mockApiPost.mockResolvedValue({ access_token: 'a2', refresh_token: 'r2' });

    const result = await refreshSession('sess.secret');

    expect(mockApiPost).toHaveBeenCalledWith({
      path: '/session-refresh',
      authed: false,
      body: { refresh_token: 'sess.secret' },
    });
    expect(result).toEqual({ access_token: 'a2', refresh_token: 'r2' });
  });

  it('throws on a malformed refresh response', async () => {
    mockApiPost.mockResolvedValue({ access_token: 'a2' });

    await expect(refreshSession('sess.secret')).rejects.toBeTruthy();
  });
});
