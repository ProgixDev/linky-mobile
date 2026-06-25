import { fetchNotifications, markNotificationsRead } from '../lib/notifications-api';
import { type AppNotification } from '../model/schema';
import { useNotificationsStore } from '../model/store';

jest.mock('../lib/notifications-api', () => ({
  fetchNotifications: jest.fn(),
  markNotificationsRead: jest.fn(),
}));
// setBadgeCount lives in shared/lib/push (expo-notifications mocked globally); spy so the
// store's badge side-effects don't reach the native stub with surprises.
jest.mock('@/shared/lib/push', () => ({ setBadgeCount: jest.fn(async () => undefined) }));

const mockFetch = fetchNotifications as jest.Mock;
const mockMark = markNotificationsRead as jest.Mock;

const notif = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1',
  category: 'order',
  title: 'Nouvelle livraison',
  body: 'body',
  iconHint: 'bolt',
  deeplink: '/delivery/d1',
  read: false,
  createdAt: 1000,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useNotificationsStore.getState().reset();
});

describe('load / refresh', () => {
  it('loads the first page and exposes items + unreadCount + cursor', async () => {
    mockFetch.mockResolvedValue({
      items: [notif()],
      nextCursor: { created_at: 'x', id: 'n1' },
      unreadCount: 2,
    });

    await useNotificationsStore.getState().load();

    const s = useNotificationsStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.unreadCount).toBe(2);
    expect(s.nextCursor).toEqual({ created_at: 'x', id: 'n1' });
    expect(s.status).toBe('idle');
  });

  it('surfaces an error status on failure', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));
    await useNotificationsStore.getState().refresh();
    expect(useNotificationsStore.getState().status).toBe('error');
  });
});

describe('loadMore', () => {
  it('appends the next page', async () => {
    mockFetch.mockResolvedValueOnce({
      items: [notif({ id: 'n1' })],
      nextCursor: { created_at: 'x', id: 'n1' },
      unreadCount: 1,
    });
    await useNotificationsStore.getState().load();

    mockFetch.mockResolvedValueOnce({
      items: [notif({ id: 'n2' })],
      nextCursor: null,
      unreadCount: 1,
    });
    await useNotificationsStore.getState().loadMore();

    const s = useNotificationsStore.getState();
    expect(s.items.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(s.nextCursor).toBeNull();
  });

  it('no-ops when there is no cursor', async () => {
    await useNotificationsStore.getState().loadMore();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('markAllRead', () => {
  it('optimistically flips everything read and clears the count, then calls the API', async () => {
    mockFetch.mockResolvedValue({ items: [notif()], nextCursor: null, unreadCount: 1 });
    await useNotificationsStore.getState().load();

    mockMark.mockResolvedValue(1);
    await useNotificationsStore.getState().markAllRead();

    const s = useNotificationsStore.getState();
    expect(s.unreadCount).toBe(0);
    expect(s.items.every((n) => n.read)).toBe(true);
    expect(mockMark).toHaveBeenCalledTimes(1);
  });

  it('skips the network call when nothing is unread', async () => {
    mockFetch.mockResolvedValue({
      items: [notif({ read: true })],
      nextCursor: null,
      unreadCount: 0,
    });
    await useNotificationsStore.getState().load();

    await useNotificationsStore.getState().markAllRead();

    expect(mockMark).not.toHaveBeenCalled();
  });
});

describe('reset', () => {
  it('wipes the inbox (sign-out)', async () => {
    mockFetch.mockResolvedValue({ items: [notif()], nextCursor: null, unreadCount: 1 });
    await useNotificationsStore.getState().load();

    useNotificationsStore.getState().reset();

    const s = useNotificationsStore.getState();
    expect(s.items).toEqual([]);
    expect(s.unreadCount).toBe(0);
  });
});
