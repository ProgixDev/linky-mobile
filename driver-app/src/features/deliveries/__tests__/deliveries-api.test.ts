import { supabase } from '@/shared/lib/supabase';

import { fetchDeliveries } from '../lib/deliveries-api';

// jest.mock is hoisted above the imports by babel-jest, so `supabase` resolves to
// this mock at module load.
jest.mock('@/shared/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = supabase.functions.invoke as jest.Mock;

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

beforeEach(() => invoke.mockReset());

describe('fetchDeliveries', () => {
  it('sends an Idempotency-Key header and NO client identity (AC-9)', async () => {
    invoke.mockResolvedValue({ data: response, error: null });

    await fetchDeliveries();

    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe('list-livreur-deliveries');
    expect(opts.headers['Idempotency-Key']).toEqual(expect.any(String));
    // The driver id is derived server-side from the JWT — never sent in the body.
    expect(opts.body).toEqual({});
  });

  it('maps the wire shape to the flat view model (AC-1)', async () => {
    invoke.mockResolvedValue({ data: response, error: null });

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
    invoke.mockResolvedValue({ data: response, error: null });

    const result = await fetchDeliveries();

    expect(result[0]).not.toHaveProperty('details');
    expect(JSON.stringify(result[0])).not.toContain('Rue Secret');
    expect(result[0]?.dropoffDistrict).toBe('Kaloum');
  });

  it('throws when the endpoint returns an error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(fetchDeliveries()).rejects.toThrow('boom');
  });

  it('throws on an unexpected payload shape', async () => {
    invoke.mockResolvedValue({ data: { nope: 1 }, error: null });

    await expect(fetchDeliveries()).rejects.toThrow('Unexpected deliveries response');
  });
});
