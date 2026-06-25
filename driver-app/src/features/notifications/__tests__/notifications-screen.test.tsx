import { router } from 'expo-router';

import { act, render, screen, waitFor, fireEvent } from '@/shared/testing/render';

import { fetchNotifications, markNotificationsRead } from '../lib/notifications-api';
import { useNotificationsStore } from '../model/store';
import { NotificationsScreen } from '../ui/notifications-screen';

jest.mock('../lib/notifications-api', () => ({
  fetchNotifications: jest.fn(),
  markNotificationsRead: jest.fn(),
}));

// useFocusEffect runs the effect on mount (like useEffect); router.push is captured.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require inside a jest factory
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
  };
});

const mockFetch = fetchNotifications as jest.Mock;
const mockMark = markNotificationsRead as jest.Mock;
const mockPush = router.push as jest.Mock;

const page = (items: unknown[], unread = 0) => ({ items, nextCursor: null, unreadCount: unread });
const item = (over = {}) => ({
  id: 'n1',
  category: 'order',
  title: 'Nouvelle livraison',
  body: 'Commande LK-2026-00042',
  iconHint: 'bolt',
  deeplink: '/delivery/d1',
  read: false,
  createdAt: 1000,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useNotificationsStore.getState().reset();
  mockMark.mockResolvedValue(0);
});

describe('NotificationsScreen', () => {
  it('loads on focus and renders the inbox, then marks all read', async () => {
    mockFetch.mockResolvedValue(page([item()], 1));

    render(<NotificationsScreen />);

    expect(await screen.findByText('Nouvelle livraison')).toBeTruthy();
    await waitFor(() => expect(mockMark).toHaveBeenCalled());
  });

  it('shows the empty state when there are no notifications', async () => {
    mockFetch.mockResolvedValue(page([], 0));

    render(<NotificationsScreen />);

    expect(await screen.findByTestId('notifications-empty')).toBeTruthy();
  });

  it('follows a validated deeplink on tap', async () => {
    mockFetch.mockResolvedValue(page([item()], 1));

    render(<NotificationsScreen />);
    const row = await screen.findByTestId('notification-row-n1');
    await act(async () => {
      fireEvent.press(row);
    });

    expect(mockPush).toHaveBeenCalledWith('/delivery/d1');
  });

  it('does not navigate for a notification with no deeplink', async () => {
    mockFetch.mockResolvedValue(page([item({ deeplink: null })], 1));

    render(<NotificationsScreen />);
    const row = await screen.findByTestId('notification-row-n1');
    await act(async () => {
      fireEvent.press(row);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});
