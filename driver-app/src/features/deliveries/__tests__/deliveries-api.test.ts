import { apiPost } from '@/shared/lib/api';

import { fetchDeliveries } from '../lib/deliveries-api';

// Hoisted above the imports by babel-jest, so the api module resolves to this mock.
jest.mock('@/shared/lib/api', () => ({ apiPost: jest.fn() }));

const mockApiPost = apiPost as jest.Mock;

// The real list-livreur-deliveries wire shape (camelCase + nested), incl. the
// street `details` the mapping must drop.
const wire = {
  id: 'd1',
  status: 'assigned',
  createdAt: '2026-06-23T10:00:00.000Z',
  deliveryAddress: { city: 'Conakry', district: 'Kaloum', details: '12 Rue Secret' },
  order: {
    reference: 'LK-2026-00001',
    productSnapshot: { title: 'Phone case', photo: 'https://x/p.jpg' },
  },
};
const response = { deliveries: [wire], next_cursor: null };

beforeEach(() => mockApiPost.mockReset());

describe('fetchDeliveries', () => {
  it('calls the list endpoint with no client identity (AC-9)', async () => {
    mockApiPost.mockResolvedValue(response);

    await fetchDeliveries();

    // No identity in the request — apiPost attaches the JWT; the server derives livreur_id.
    expect(mockApiPost).toHaveBeenCalledWith({ path: '/list-livreur-deliveries', body: {} });
  });

  it('maps the wire shape to the flat view model (AC-1)', async () => {
    mockApiPost.mockResolvedValue(response);

    const result = await fetchDeliveries();

    expect(result).toEqual([
      {
        id: 'd1',
        orderRef: 'LK-2026-00001',
        itemTitle: 'Phone case',
        itemPhoto: 'https://x/p.jpg',
        dropoffCity: 'Conakry',
        dropoffDistrict: 'Kaloum',
        status: 'assigned',
        createdAt: Date.parse('2026-06-23T10:00:00.000Z'),
      },
    ]);
  });

  it('drops the street details so the cache stays area-only (AC-10)', async () => {
    mockApiPost.mockResolvedValue(response);

    const result = await fetchDeliveries();

    expect(JSON.stringify(result[0])).not.toContain('Rue Secret');
    expect(result[0]?.dropoffDistrict).toBe('Kaloum');
  });

  it('propagates api errors', async () => {
    mockApiPost.mockRejectedValue(new Error('boom'));

    await expect(fetchDeliveries()).rejects.toThrow('boom');
  });

  it('throws on an unexpected payload shape', async () => {
    mockApiPost.mockResolvedValue({ nope: 1 });

    await expect(fetchDeliveries()).rejects.toThrow('Unexpected deliveries response');
  });
});
