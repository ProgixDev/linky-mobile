import { apiPost, ApiError } from '@/shared/lib/api';

import { confirmHandoff, fetchDeliveries, getDelivery } from '../lib/deliveries-api';

// Mock the api transport. Keep a real-enough ApiError so confirmHandoff's
// `instanceof ApiError` + `.code` branching runs against the SAME class the
// code under test imports (both resolve to this mocked module).
jest.mock('@/shared/lib/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    message_fr: string;
    constructor(status: number, body: { code: string; message_fr: string }) {
      super(body.message_fr || body.code);
      this.name = 'ApiError';
      this.status = status;
      this.code = body.code;
      this.message_fr = body.message_fr;
    }
  }
  return { apiPost: jest.fn(), ApiError };
});

const mockApiPost = apiPost as jest.Mock;
const apiError = (status: number, code: string, message_fr = '') =>
  new ApiError(status, { code, message_fr });

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

// --- Spec 002 ---

const detailWire = {
  id: 'd1',
  orderId: 'o1',
  status: 'assigned',
  createdAt: '2026-06-23T10:00:00.000Z',
  deliveryAddress: { city: 'Conakry', district: 'Kaloum', details: '12 Rue Example' },
  order: {
    id: 'o1',
    reference: 'LK-2026-00001',
    productSnapshot: { title: 'Phone case', photo: 'https://x/p.jpg' },
    amountGnf: 150000,
    status: 'paid',
  },
  buyer: { displayName: 'Mariama' },
};

describe('getDelivery', () => {
  it('requests by delivery_id only — no client identity (AC-9)', async () => {
    mockApiPost.mockResolvedValue(detailWire);

    await getDelivery('d1');

    expect(mockApiPost).toHaveBeenCalledWith({
      path: '/get-delivery',
      body: { delivery_id: 'd1' },
    });
  });

  it('maps the wire to the flat detail incl. full street address + buyer name (AC-1)', async () => {
    mockApiPost.mockResolvedValue(detailWire);

    const result = await getDelivery('d1');

    expect(result).toEqual({
      id: 'd1',
      orderId: 'o1',
      orderRef: 'LK-2026-00001',
      amountGnf: 150000,
      itemTitle: 'Phone case',
      itemPhoto: 'https://x/p.jpg',
      addressCity: 'Conakry',
      addressDistrict: 'Kaloum',
      addressDetails: '12 Rue Example',
      buyerName: 'Mariama',
      status: 'assigned',
    });
  });

  it('falls back to "Customer" when the buyer name is null', async () => {
    mockApiPost.mockResolvedValue({ ...detailWire, buyer: { displayName: null } });

    const result = await getDelivery('d1');

    expect(result.buyerName).toBe('Customer');
  });

  it('throws on an unexpected payload shape', async () => {
    mockApiPost.mockResolvedValue({ nope: 1 });

    await expect(getDelivery('d1')).rejects.toThrow('Unexpected delivery response');
  });
});

describe('confirmHandoff', () => {
  const args = { orderId: 'o1', scanToken: 't1' };

  it('sends only order_id + scan_token, no identity (AC-9), and returns success', async () => {
    mockApiPost.mockResolvedValue({ delivery: { id: 'd1' }, order_status: 'released' });

    const result = await confirmHandoff(args);

    expect(mockApiPost).toHaveBeenCalledWith({
      path: '/livreur-confirm-handoff',
      body: { order_id: 'o1', scan_token: 't1' },
    });
    expect(result).toEqual({ kind: 'success', orderStatus: 'released' });
  });

  it('maps INVALID_SCAN_TOKEN → mismatch, releasing nothing (AC-5)', async () => {
    mockApiPost.mockRejectedValue(apiError(400, 'INVALID_SCAN_TOKEN'));

    expect(await confirmHandoff(args)).toEqual({ kind: 'mismatch' });
  });

  it('maps NOT_ASSIGNED_LIVREUR → mismatch (AC-5/AC-9)', async () => {
    mockApiPost.mockRejectedValue(apiError(403, 'NOT_ASSIGNED_LIVREUR'));

    expect(await confirmHandoff(args)).toEqual({ kind: 'mismatch' });
  });

  it('maps INVALID_STATUS → already_done (AC-8)', async () => {
    mockApiPost.mockRejectedValue(apiError(400, 'INVALID_STATUS'));

    expect(await confirmHandoff(args)).toEqual({ kind: 'already_done' });
  });

  it('maps a transport failure → offline, releasing nothing (AC-7)', async () => {
    mockApiPost.mockRejectedValue(apiError(0, 'NETWORK_ERROR', 'Connexion impossible'));

    expect(await confirmHandoff(args)).toEqual({ kind: 'offline' });
  });

  it('maps an unexpected success payload → error', async () => {
    mockApiPost.mockResolvedValue({ nope: 1 });

    const result = await confirmHandoff(args);
    expect(result.kind).toBe('error');
  });
});
