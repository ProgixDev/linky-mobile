import { apiPost } from '@/shared/lib/api';

import { fetchAvailability, setAvailability } from '../lib/availability-api';

jest.mock('@/shared/lib/api', () => ({ apiPost: jest.fn() }));
const mockPost = apiPost as jest.Mock;

beforeEach(() => mockPost.mockReset());

describe('availability-api', () => {
  it('reads is_online from the application-status response', async () => {
    mockPost.mockResolvedValue({ status: 'approved', is_online: true });
    expect(await fetchAvailability()).toEqual({ ok: true, online: true });
  });

  it('defaults online to false when is_online is absent', async () => {
    mockPost.mockResolvedValue({ status: 'approved' });
    expect(await fetchAvailability()).toEqual({ ok: true, online: false });
  });

  it('returns not-ok when the read throws', async () => {
    mockPost.mockRejectedValue(new Error('down'));
    expect(await fetchAvailability()).toEqual({ ok: false });
  });

  it('posts the new state to set-livreur-availability', async () => {
    mockPost.mockResolvedValue({ online: true });

    expect(await setAvailability(true)).toBe(true);
    expect(mockPost).toHaveBeenCalledWith({
      path: '/set-livreur-availability',
      body: { online: true },
    });
  });

  it('returns false when the set throws', async () => {
    mockPost.mockRejectedValue(new Error('down'));
    expect(await setAvailability(false)).toBe(false);
  });
});
