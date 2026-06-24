import { fireEvent, render, screen, waitFor } from '@/shared/testing/render';

import { requestOtp, verifyOtp } from '../lib/auth-api';
import { useAuthStore } from '../model/store';
import { SignInScreen } from '../ui/sign-in-screen';

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

const mockRequestOtp = requestOtp as jest.Mock;
const mockVerifyOtp = verifyOtp as jest.Mock;

const bundle = {
  access_token: 'a.b.c',
  refresh_token: 'sess.secret',
  user: { id: 'u1', display_name: 'Driver', roles: ['livreur'] },
  was_created: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    status: 'unauthenticated',
    user: null,
    error: null,
    otpId: null,
    pendingEmail: null,
    devCode: null,
  });
});

describe('SignInScreen — OTP flow', () => {
  it('starts on the email step', () => {
    render(<SignInScreen />);
    expect(screen.getByTestId('auth-email')).toBeTruthy();
    expect(screen.queryByTestId('auth-code')).toBeNull();
  });

  it('email → send code advances to the code step and surfaces the dev code', async () => {
    mockRequestOtp.mockResolvedValue({ ok: true, otpId: 'otp-1', devCode: '123456' });
    render(<SignInScreen />);

    fireEvent.changeText(screen.getByTestId('auth-email'), 'driver@example.com');
    fireEvent.press(screen.getByTestId('auth-request-code'));

    await waitFor(() => expect(screen.getByTestId('auth-code')).toBeTruthy());
    expect(mockRequestOtp).toHaveBeenCalledWith({ email: 'driver@example.com' });
    expect(screen.getByTestId('auth-dev-code')).toHaveTextContent('Dev code: 123456');
    // Resend is gated by the cooldown right after a send.
    expect(screen.getByTestId('auth-resend')).toHaveTextContent(/Resend code in \d+s/);
  });

  it('valid code → verify → authenticated', async () => {
    useAuthStore.setState({ otpId: 'otp-1', pendingEmail: 'driver@example.com' });
    mockVerifyOtp.mockResolvedValue({ ok: true, bundle });
    render(<SignInScreen />);

    fireEvent.changeText(screen.getByTestId('auth-code'), '123456');
    fireEvent.press(screen.getByTestId('auth-verify'));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(mockVerifyOtp).toHaveBeenCalledWith({ otpId: 'otp-1', code: '123456' });
  });

  it('does not verify until the code is 6 digits (button disabled)', async () => {
    useAuthStore.setState({ otpId: 'otp-1', pendingEmail: 'driver@example.com' });
    render(<SignInScreen />);

    fireEvent.changeText(screen.getByTestId('auth-code'), '12'); // too short
    fireEvent.press(screen.getByTestId('auth-verify'));

    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('shows the server error message on a failed request and stays on the email step', async () => {
    mockRequestOtp.mockResolvedValue({
      ok: false,
      kind: 'rate_limited',
      message: 'Trop de demandes.',
    });
    render(<SignInScreen />);

    fireEvent.changeText(screen.getByTestId('auth-email'), 'driver@example.com');
    fireEvent.press(screen.getByTestId('auth-request-code'));

    await waitFor(() =>
      expect(screen.getByTestId('auth-error')).toHaveTextContent('Trop de demandes.'),
    );
    expect(screen.getByTestId('auth-email')).toBeTruthy(); // still email step
    expect(screen.queryByTestId('auth-code')).toBeNull();
  });

  it('“use a different email” returns to the email step', async () => {
    useAuthStore.setState({
      otpId: 'otp-1',
      pendingEmail: 'driver@example.com',
      devCode: '123456',
    });
    render(<SignInScreen />);
    expect(screen.getByTestId('auth-code')).toBeTruthy();

    fireEvent.press(screen.getByTestId('auth-change-email'));

    await waitFor(() => expect(screen.getByTestId('auth-email')).toBeTruthy());
    expect(screen.queryByTestId('auth-code')).toBeNull();
  });
});
