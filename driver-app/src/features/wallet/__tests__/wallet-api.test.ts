import { apiPost } from '@/shared/lib/api';

import { cancelWithdrawal, fetchWallet, requestWithdrawal } from '../lib/wallet-api';

jest.mock('@/shared/lib/api', () => ({ apiPost: jest.fn() }));
const mockPost = apiPost as jest.Mock;

beforeEach(() => mockPost.mockReset());

const WIRE = {
  balance_minor: 15000,
  entries: [
    {
      id: 'e1',
      direction: 'credit',
      amount_minor: 15000,
      ref_type: 'livreur_delivery_fee',
      order_reference: 'LK-2026-10123',
      created_at: '2026-10-31T10:00:00Z',
    },
  ],
  withdrawals: [
    {
      id: 'w1',
      amount_minor: 5000,
      status: 'approved',
      destination: 'Orange Money — 622 33 44 55',
      reason: null,
      created_at: '2026-10-31T11:00:00Z',
      decided_at: '2026-10-31T11:00:00Z',
      cancellable: true,
    },
  ],
};

describe('wallet-api', () => {
  it('reads the livreur wallet from livreur-wallet', async () => {
    mockPost.mockResolvedValue(WIRE);
    const w = await fetchWallet();
    expect(mockPost).toHaveBeenCalledWith({ path: '/livreur-wallet' });
    expect(w.balance_minor).toBe(15000);
    expect(w.entries[0]?.order_reference).toBe('LK-2026-10123');
    expect(w.withdrawals[0]?.cancellable).toBe(true);
  });

  it('rejects a malformed response', async () => {
    mockPost.mockResolvedValue({ balance: 'x' });
    await expect(fetchWallet()).rejects.toThrow('Unexpected wallet response');
  });

  it('sends the amount and destination to livreur-wallet-withdraw', async () => {
    mockPost.mockResolvedValue({ withdrawal: { id: 'w2' } });
    await requestWithdrawal(10000, 'MTN Mobile Money — 660 69 88 48');
    expect(mockPost).toHaveBeenCalledWith({
      path: '/livreur-wallet-withdraw',
      body: { amount_minor: 10000, destination: 'MTN Mobile Money — 660 69 88 48' },
    });
  });

  it('cancels through the shared wallet-withdraw-cancel', async () => {
    mockPost.mockResolvedValue({ withdrawal: { id: 'w1' } });
    await cancelWithdrawal('w1');
    expect(mockPost).toHaveBeenCalledWith({
      path: '/wallet-withdraw-cancel',
      body: { request_id: 'w1' },
    });
  });
});
