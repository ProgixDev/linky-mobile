import * as Notifications from 'expo-notifications';

import { apiPost } from '../api';
import {
  getPushPermissionStatus,
  registerPushToken,
  requestPushPermission,
  unregisterPushToken,
} from '../push';
import { appStorage } from '../storage';

jest.mock('../api', () => ({ apiPost: jest.fn() }));
// A projectId is required for getExpoPushTokenAsync; provide one (jest-expo's Constants
// has none by default).
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'test-eas-id' } } }, easConfig: null },
}));

const mockApiPost = apiPost as jest.Mock;
const TOKEN_KEY = 'push-token-v1';

beforeEach(async () => {
  jest.clearAllMocks();
  await appStorage.remove(TOKEN_KEY);
});

describe('registerPushToken', () => {
  it('registers the Expo token as a DRIVER token and persists it', async () => {
    mockApiPost.mockResolvedValue({ registered: true });

    const token = await registerPushToken();

    expect(token).toBe('ExpoPushToken[jest-mock]');
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    const arg = mockApiPost.mock.calls[0][0];
    expect(arg.path).toBe('/register-push-token');
    expect(arg.body.app).toBe('driver'); // never leaks into the marketplace app
    expect(arg.body.token).toBe('ExpoPushToken[jest-mock]');
    expect(['ios', 'android']).toContain(arg.body.platform);
    expect(await appStorage.get(TOKEN_KEY)).toBe('ExpoPushToken[jest-mock]');
  });

  it('returns null and does not throw when registration fails (best-effort)', async () => {
    mockApiPost.mockRejectedValue(new Error('network'));
    await expect(registerPushToken()).resolves.toBeNull();
  });
});

describe('unregisterPushToken', () => {
  it('unregisters the stored token and clears it locally', async () => {
    await appStorage.set(TOKEN_KEY, 'ExpoPushToken[abc]');
    mockApiPost.mockResolvedValue({ unregistered: true });

    await unregisterPushToken();

    const arg = mockApiPost.mock.calls[0][0];
    expect(arg.path).toBe('/unregister-push-token');
    expect(arg.body).toEqual({ token: 'ExpoPushToken[abc]' });
    expect(await appStorage.get(TOKEN_KEY)).toBeNull();
  });

  it('no-ops the network call when no token is stored, but still clears the badge', async () => {
    await unregisterPushToken();
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
  });

  it('still clears the local token even if the network call fails (sign-out must not block)', async () => {
    await appStorage.set(TOKEN_KEY, 'ExpoPushToken[abc]');
    mockApiPost.mockRejectedValue(new Error('offline'));

    await expect(unregisterPushToken()).resolves.toBeUndefined();
    expect(await appStorage.get(TOKEN_KEY)).toBeNull();
  });
});

describe('permissions', () => {
  it('reports the current status without prompting', async () => {
    await expect(getPushPermissionStatus()).resolves.toBe('granted');
    expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
  });

  it('returns true when permission is granted', async () => {
    await expect(requestPushPermission()).resolves.toBe(true);
  });

  it('returns false when permission is denied', async () => {
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
    });
    await expect(requestPushPermission()).resolves.toBe(false);
  });
});
