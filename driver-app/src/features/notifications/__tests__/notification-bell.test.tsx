import { router } from 'expo-router';

import { fireEvent, render, screen } from '@/shared/testing/render';

import { useNotificationsStore } from '../model/store';
import { NotificationBell } from '../ui/notification-bell';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const mockPush = router.push as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useNotificationsStore.setState({ unreadCount: 0 });
});

describe('NotificationBell', () => {
  it('shows no badge at zero unread', () => {
    render(<NotificationBell />);
    expect(screen.queryByTestId('notifications-bell-badge')).toBeNull();
  });

  it('shows the unread count, capped at 99+', () => {
    useNotificationsStore.setState({ unreadCount: 150 });
    render(<NotificationBell />);
    expect(screen.getByTestId('notifications-bell-badge')).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('navigates to the inbox on press', () => {
    render(<NotificationBell />);
    fireEvent.press(screen.getByTestId('notifications-bell'));
    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });
});
