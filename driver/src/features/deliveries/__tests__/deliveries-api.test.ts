import { supabase } from '@/shared/lib/supabase';

import { fetchDeliveries } from '../lib/deliveries-api';

// jest.mock is hoisted above the imports by babel-jest, so `supabase` resolves to
// this mock at module load.
jest.mock('@/shared/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = supabase.functions.invoke as jest.Mock;

const validDelivery = {
  id: 'd1',
  orderRef: 'LK-2026-00001',
  itemTitle: 'Phone case',
  itemPhoto: '',
  shopName: 'TechShop',
  dropoffCity: 'Conakry',
  dropoffDistrict: 'Kaloum',
  status: 'assigned',
  createdAt: 1700000000000,
};

beforeEach(() => invoke.mockReset());

describe('fetchDeliveries', () => {
  it('invokes the endpoint with NO client-supplied identity (AC-9)', async () => {
    invoke.mockResolvedValue({ data: [validDelivery], error: null });

    await fetchDeliveries();

    expect(invoke).toHaveBeenCalledWith('list-livreur-deliveries', { method: 'POST' });
    // The driver id must never be sent by the client — it is derived server-side.
    const [, options] = invoke.mock.calls[0];
    expect(JSON.stringify(options ?? {})).not.toMatch(/livreur|user|driver|id/i);
  });

  it('parses and returns the delivery list', async () => {
    invoke.mockResolvedValue({ data: [validDelivery], error: null });

    const result = await fetchDeliveries();

    expect(result).toHaveLength(1);
    expect(result[0]?.orderRef).toBe('LK-2026-00001');
  });

  it('strips unknown fields such as street details (AC-10)', async () => {
    invoke.mockResolvedValue({
      data: [{ ...validDelivery, details: '12 Rue Secret' }],
      error: null,
    });

    const result = await fetchDeliveries();

    expect(result[0]).not.toHaveProperty('details');
  });

  it('throws when the endpoint returns an error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(fetchDeliveries()).rejects.toThrow('boom');
  });

  it('throws on an unexpected payload shape', async () => {
    invoke.mockResolvedValue({ data: [{ id: 'x' }], error: null });

    await expect(fetchDeliveries()).rejects.toThrow('Unexpected deliveries response');
  });
});
