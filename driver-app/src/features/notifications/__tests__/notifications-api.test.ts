import { apiPost } from '@/shared/lib/api';

import { fetchNotifications, markNotificationsRead } from '../lib/notifications-api';

jest.mock('@/shared/lib/api', () => ({ apiPost: jest.fn() }));

const mockApiPost = apiPost as jest.Mock;

const wireRow = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  category: 'order',
  title: 'Nouvelle livraison',
  body: 'La commande LK-2026-00042 t’a été assignée.',
  icon_hint: 'bolt',
  deeplink: '/delivery/d1',
  ref_type: 'order',
  ref_id: 'o1',
  read_at: null,
  created_at: '2026-06-25T10:00:00.000Z',
  ...over,
});

beforeEach(() => mockApiPost.mockReset());

describe('fetchNotifications', () => {
  it('maps wire rows to the view model and carries unread_count + next_cursor', async () => {
    mockApiPost.mockResolvedValue({
      notifications: [wireRow()],
      next_cursor: { created_at: '2026-06-25T10:00:00.000Z', id: 'n1' },
      unread_count: 3,
    });

    const page = await fetchNotifications();

    expect(mockApiPost).toHaveBeenCalledWith({ path: '/list-notifications', body: {} });
    expect(page.unreadCount).toBe(3);
    expect(page.nextCursor).toEqual({ created_at: '2026-06-25T10:00:00.000Z', id: 'n1' });
    expect(page.items[0]).toEqual({
      id: 'n1',
      category: 'order',
      title: 'Nouvelle livraison',
      body: 'La commande LK-2026-00042 t’a été assignée.',
      iconHint: 'bolt',
      deeplink: '/delivery/d1',
      read: false,
      createdAt: Date.parse('2026-06-25T10:00:00.000Z'),
    });
  });

  it('treats a non-null read_at as read and a null deeplink as null', async () => {
    mockApiPost.mockResolvedValue({
      notifications: [wireRow({ read_at: '2026-06-25T11:00:00.000Z', deeplink: null })],
      next_cursor: null,
      unread_count: 0,
    });

    const page = await fetchNotifications();

    expect(page.items[0]?.read).toBe(true);
    expect(page.items[0]?.deeplink).toBeNull();
    expect(page.nextCursor).toBeNull();
  });

  it('sends the cursor when paginating', async () => {
    mockApiPost.mockResolvedValue({ notifications: [], next_cursor: null, unread_count: 0 });
    const cursor = { created_at: '2026-06-25T10:00:00.000Z', id: 'n1' };

    await fetchNotifications(cursor);

    expect(mockApiPost).toHaveBeenCalledWith({ path: '/list-notifications', body: { cursor } });
  });

  it('throws on an unexpected payload shape', async () => {
    mockApiPost.mockResolvedValue({ nope: true });
    await expect(fetchNotifications()).rejects.toThrow('Unexpected notifications response');
  });
});

describe('markNotificationsRead', () => {
  it('calls the endpoint and returns marked_count', async () => {
    mockApiPost.mockResolvedValue({ marked_count: 4 });

    await expect(markNotificationsRead()).resolves.toBe(4);
    expect(mockApiPost).toHaveBeenCalledWith({ path: '/mark-notifications-read', body: {} });
  });

  it('returns 0 on an unexpected payload (never throws — coarse mark-all)', async () => {
    mockApiPost.mockResolvedValue('weird');
    await expect(markNotificationsRead()).resolves.toBe(0);
  });
});
