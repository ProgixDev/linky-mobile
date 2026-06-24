import { ApiError, apiPost } from '@/shared/lib/api';

import { confirmHandoff, fetchDeliveries, getDelivery } from '../lib/deliveries-api';

// Mock the Linky fetch client. A real ApiError subclass keeps the lib's
// `instanceof ApiError` branch working (status/code/message_fr carried through).
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
const apiErr = (status: number, code: string, message_fr = '') =>
  new ApiError(status, { code, message_fr });

const ORDER_UUID = '11111111-1111-4111-8111-111111111111';
const TOKEN_UUID = '22222222-2222-4222-8222-222222222222';

// The deployed `list-livreur-deliveries` wire row: nested camelCase, ISO createdAt, no
// shop join. Wrapped in the `{ deliveries, next_cursor }` envelope the backend returns.
const wireListRow = {
  id: 'd1',
  status: 'assigned',
  createdAt: '2026-06-22T10:00:00.000Z',
  deliveryAddress: { city: 'Conakry', district: 'Kaloum' },
  order: {
    reference: 'LK-2026-00001',
    productSnapshot: { title: 'Phone case', photo: '' },
  },
};
const listEnvelope = (rows: unknown[]) => ({ deliveries: rows, next_cursor: null });

// The `get-delivery` wire shape (camelCase + nested) — carries the FULL street address
// + buyer name, unlike the list.
const detailWire = {
  id: 'd1',
  orderId: ORDER_UUID,
  status: 'assigned',
  createdAt: '2026-06-22T10:00:00.000Z',
  deliveryAddress: { city: 'Conakry', district: 'Kaloum', details: '12 Rue de la Paix' },
  order: {
    id: ORDER_UUID,
    reference: 'LK-2026-00042',
    productSnapshot: { title: 'Blue mug', photo: '' },
    amountGnf: 150000,
    status: 'paid',
  },
  buyer: { displayName: 'Mariama' },
};

beforeEach(() => mockApiPost.mockReset());

describe('fetchDeliveries', () => {
  it('calls the endpoint with NO client-supplied identity (AC-9)', async () => {
    mockApiPost.mockResolvedValue(listEnvelope([wireListRow]));

    await fetchDeliveries();

    expect(mockApiPost).toHaveBeenCalledWith({ path: '/list-livreur-deliveries' });
    // The driver id must never be sent by the client — there is no request body at
    // all; identity is derived server-side from the JWT.
    expect(mockApiPost.mock.calls[0][0].body).toBeUndefined();
  });

  it('parses the { deliveries, next_cursor } envelope and maps nested rows to the flat model', async () => {
    mockApiPost.mockResolvedValue(listEnvelope([wireListRow]));

    const result = await fetchDeliveries();

    expect(result).toHaveLength(1);
    expect(result[0]?.orderRef).toBe('LK-2026-00001');
    expect(result[0]?.itemTitle).toBe('Phone case');
    expect(result[0]?.dropoffCity).toBe('Conakry');
    expect(result[0]?.status).toBe('assigned');
    expect(result[0]?.createdAt).toBe(Date.parse('2026-06-22T10:00:00.000Z'));
  });

  it('returns an empty list for the empty envelope (no error state on zero deliveries)', async () => {
    mockApiPost.mockResolvedValue({ deliveries: [], next_cursor: null });

    await expect(fetchDeliveries()).resolves.toEqual([]);
  });

  it('never surfaces the street details from the list (AC-10)', async () => {
    // Even if the address blob carries a street `details`, the wire schema drops it.
    mockApiPost.mockResolvedValue(
      listEnvelope([
        {
          ...wireListRow,
          deliveryAddress: { city: 'Conakry', district: 'Kaloum', details: '12 Rue Secret' },
        },
      ]),
    );

    const result = await fetchDeliveries();

    expect(result[0]).not.toHaveProperty('details');
    expect(JSON.stringify(result[0])).not.toMatch(/Rue Secret/);
    expect(result[0]?.dropoffCity).toBe('Conakry');
  });

  it('propagates the backend error (store shows the error state)', async () => {
    mockApiPost.mockRejectedValue(apiErr(500, 'QUERY_FAILED', 'Erreur serveur.'));

    await expect(fetchDeliveries()).rejects.toThrow('Erreur serveur.');
  });

  it('throws on an unexpected payload shape (e.g. a bare array, not the envelope)', async () => {
    mockApiPost.mockResolvedValue([{ id: 'x' }]);

    await expect(fetchDeliveries()).rejects.toThrow('Unexpected deliveries response');
  });
});

describe('getDelivery', () => {
  it('sends ONLY the delivery id and returns the flat detail incl. full street address (AC-1/AC-9)', async () => {
    mockApiPost.mockResolvedValue(detailWire);

    const result = await getDelivery('d1');

    expect(mockApiPost).toHaveBeenCalledWith({
      path: '/get-delivery',
      body: { delivery_id: 'd1' },
    });
    // No client identity travels with the request — only the delivery id.
    expect(JSON.stringify(mockApiPost.mock.calls[0][0].body)).not.toMatch(/livreur|driver|user/i);

    expect(result.orderId).toBe(ORDER_UUID);
    expect(result.orderRef).toBe('LK-2026-00042');
    expect(result.amountGnf).toBe(150000);
    expect(result.buyerName).toBe('Mariama');
    expect(result.addressDetails).toBe('12 Rue de la Paix'); // full street revealed here
    expect(result.addressCity).toBe('Conakry');
    expect(result.status).toBe('assigned');
  });

  it('falls back to "Customer" when the buyer display name is null (AC-1)', async () => {
    mockApiPost.mockResolvedValue({ ...detailWire, buyer: { displayName: null } });

    const result = await getDelivery('d1');

    expect(result.buyerName).toBe('Customer');
  });

  it('propagates the backend error', async () => {
    mockApiPost.mockRejectedValue(apiErr(404, 'DELIVERY_NOT_FOUND', 'Livraison introuvable.'));

    await expect(getDelivery('d1')).rejects.toThrow('Livraison introuvable.');
  });

  it('throws on an unexpected payload shape', async () => {
    mockApiPost.mockResolvedValue({ id: 'd1' });

    await expect(getDelivery('d1')).rejects.toThrow('Unexpected delivery response');
  });
});

describe('confirmHandoff', () => {
  it('sends ONLY order id + scan token (no identity, AC-9) and returns success', async () => {
    mockApiPost.mockResolvedValue({ order_status: 'released' });

    const outcome = await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID });

    expect(outcome).toEqual({ kind: 'success', orderStatus: 'released' });
    const arg = mockApiPost.mock.calls[0][0];
    expect(arg.path).toBe('/livreur-confirm-handoff');
    expect(arg.body).toEqual({ order_id: ORDER_UUID, scan_token: TOKEN_UUID });
    // The driver identity is derived server-side from the JWT — never sent.
    expect(JSON.stringify(arg.body)).not.toMatch(/livreur|driver|user/i);
  });

  it('forwards a stable Idempotency-Key when given (AC-7 retry replays)', async () => {
    mockApiPost.mockResolvedValue({ order_status: 'released' });

    await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID, idempotencyKey: 'idem-1' });

    expect(mockApiPost.mock.calls[0][0].idempotencyKey).toBe('idem-1');
  });

  it('maps a forged/wrong token to mismatch — nothing released (AC-5)', async () => {
    mockApiPost.mockRejectedValue(apiErr(400, 'INVALID_SCAN_TOKEN'));

    expect(await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID })).toEqual({
      kind: 'mismatch',
    });
  });

  it('maps not-the-assigned-driver to mismatch (AC-5/AC-9)', async () => {
    mockApiPost.mockRejectedValue(apiErr(403, 'NOT_ASSIGNED_LIVREUR'));

    expect(await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID })).toEqual({
      kind: 'mismatch',
    });
  });

  it('maps a non-releasable order status to already_done (AC-8)', async () => {
    mockApiPost.mockRejectedValue(apiErr(400, 'INVALID_STATUS'));

    expect(await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID })).toEqual({
      kind: 'already_done',
    });
  });

  it('maps a non-releasable delivery status to already_done (AC-8)', async () => {
    mockApiPost.mockRejectedValue(apiErr(400, 'INVALID_DELIVERY_STATUS'));

    expect(await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID })).toEqual({
      kind: 'already_done',
    });
  });

  it('maps a transport failure to offline — money action is online-only (AC-7)', async () => {
    mockApiPost.mockRejectedValue(apiErr(0, 'NETWORK_ERROR', 'Connexion impossible'));

    expect(await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID })).toEqual({
      kind: 'offline',
    });
  });

  it('surfaces an unknown server error with its French message', async () => {
    mockApiPost.mockRejectedValue(apiErr(500, 'SERVER_BOOM', 'Erreur serveur.'));

    expect(await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID })).toEqual({
      kind: 'error',
      message: 'Erreur serveur.',
    });
  });

  it('does NOT leak a raw transport string for an unknown code — generic copy only', async () => {
    // A 5xx with an unmapped code and no curated French message.
    mockApiPost.mockRejectedValue(apiErr(500, 'WEIRD_5XX', ''));

    expect(await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID })).toEqual({
      kind: 'error',
      message: 'Confirmation failed',
    });
  });

  // Contract gate: every code the `livreur_confirm_handoff` RPC can raise MUST map to a
  // deliberate outcome. A new server code with no mapping silently falls to { kind: 'error' }
  // — for a money action that is a bug, so enumerate them here. Note INVALID_STATUS (the
  // code a post-release retry raises) → already_done, never a re-attempt invite.
  describe('error-code → outcome contract', () => {
    const cases: [string, string][] = [
      ['INVALID_SCAN_TOKEN', 'mismatch'],
      ['NOT_ASSIGNED_LIVREUR', 'mismatch'],
      ['ORDER_NOT_FOUND', 'mismatch'],
      ['DELIVERY_NOT_FOUND', 'mismatch'],
      ['INVALID_STATUS', 'already_done'],
      ['INVALID_DELIVERY_STATUS', 'already_done'],
    ];

    it.each(cases)('maps %s → %s', async (code, kind) => {
      mockApiPost.mockRejectedValue(apiErr(400, code));
      const outcome = await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID });
      expect(outcome.kind).toBe(kind);
    });
  });

  it('treats an unexpected success payload as an error (not a false release)', async () => {
    mockApiPost.mockResolvedValue({ nope: true });

    expect(await confirmHandoff({ orderId: ORDER_UUID, scanToken: TOKEN_UUID })).toEqual({
      kind: 'error',
      message: 'Unexpected confirm response',
    });
  });
});
