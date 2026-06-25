import { fireEvent, render, screen } from '@/shared/testing/render';

import { type AppNotification } from '../model/schema';
import { NotificationRow, relativeTime } from '../ui/notification-row';

const NOW = Date.parse('2026-06-25T12:00:00.000Z');

const notif = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1',
  category: 'order',
  title: 'Nouvelle livraison',
  body: 'La commande LK-2026-00042 t’a été assignée.',
  iconHint: 'bolt',
  deeplink: '/delivery/d1',
  read: false,
  createdAt: NOW - 5 * 60000,
  ...over,
});

describe('relativeTime', () => {
  it('formats the recency buckets in French', () => {
    expect(relativeTime(NOW - 10_000, NOW)).toBe('à l’instant');
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe('il y a 5 min');
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe('il y a 3 h');
    expect(relativeTime(NOW - 24 * 3_600_000, NOW)).toBe('hier');
    expect(relativeTime(NOW - 3 * 24 * 3_600_000, NOW)).toBe('il y a 3 j');
  });
});

describe('NotificationRow', () => {
  it('renders the title + body and an unread dot when unread', () => {
    render(<NotificationRow notification={notif()} now={NOW} onPress={jest.fn()} />);
    expect(screen.getByText('Nouvelle livraison')).toBeTruthy();
    expect(screen.getByTestId('notification-unread-dot')).toBeTruthy();
  });

  it('hides the unread dot once read', () => {
    render(<NotificationRow notification={notif({ read: true })} now={NOW} onPress={jest.fn()} />);
    expect(screen.queryByTestId('notification-unread-dot')).toBeNull();
  });

  it('calls onPress with the notification', () => {
    const onPress = jest.fn();
    const n = notif();
    render(<NotificationRow notification={n} now={NOW} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('notification-row-n1'));
    expect(onPress).toHaveBeenCalledWith(n);
  });
});
