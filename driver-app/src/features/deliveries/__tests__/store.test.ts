import { fetchDeliveries } from '../lib/deliveries-api';
import type { Delivery } from '../model/schema';
import { selectActiveDeliveries, useDeliveriesStore } from '../model/store';

// Hoisted above the imports by babel-jest, so the store loads the mocked api.
jest.mock('../lib/deliveries-api', () => ({ fetchDeliveries: jest.fn() }));

const mockFetch = fetchDeliveries as jest.Mock;

const make = (over: Partial<Delivery> = {}): Delivery => ({
  id: 'd1',
  orderRef: 'LK-1',
  itemTitle: 'Item',
  itemPhoto: '',
  shopName: 'Shop',
  dropoffCity: 'Conakry',
  dropoffDistrict: 'Kaloum',
  status: 'assigned',
  createdAt: 1000,
  ...over,
});

const initial = useDeliveriesStore.getState();

beforeEach(() => {
  mockFetch.mockReset();
  useDeliveriesStore.setState(initial, true);
  useDeliveriesStore.setState({ items: [], status: 'idle', error: null, lastFetchedAt: null });
});

describe('deliveries store', () => {
  it('loads deliveries into the store (AC-1)', async () => {
    mockFetch.mockResolvedValue([make()]);

    await useDeliveriesStore.getState().load();

    const s = useDeliveriesStore.getState();
    expect(s.status).toBe('success');
    expect(s.items).toHaveLength(1);
    expect(s.lastFetchedAt).not.toBeNull();
  });

  it('refresh re-fetches and the list reflects server changes (AC-4)', async () => {
    mockFetch.mockResolvedValueOnce([make({ id: 'a', itemTitle: 'First' })]);
    await useDeliveriesStore.getState().load();
    expect(useDeliveriesStore.getState().items.map((d) => d.id)).toEqual(['a']);

    mockFetch.mockResolvedValueOnce([make({ id: 'b', itemTitle: 'Second' })]);
    await useDeliveriesStore.getState().refresh();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(useDeliveriesStore.getState().items.map((d) => d.id)).toEqual(['b']);
  });

  it('keeps cached items and flags error when a refresh fails (AC-6, AC-7)', async () => {
    mockFetch.mockResolvedValueOnce([make()]);
    await useDeliveriesStore.getState().load();

    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await useDeliveriesStore.getState().refresh();

    const s = useDeliveriesStore.getState();
    expect(s.status).toBe('error');
    expect(s.error).toBe('offline');
    expect(s.items).toHaveLength(1); // cache preserved
  });

  it('clearCache empties items and resets status (AC-9)', async () => {
    mockFetch.mockResolvedValue([make()]);
    await useDeliveriesStore.getState().load();

    useDeliveriesStore.getState().clearCache();

    const s = useDeliveriesStore.getState();
    expect(s.items).toHaveLength(0);
    expect(s.status).toBe('idle');
  });
});

describe('selectActiveDeliveries', () => {
  it('keeps only active statuses (AC-2)', () => {
    const items = [
      make({ id: 'a', status: 'assigned' }),
      make({ id: 'b', status: 'delivered' }),
      make({ id: 'c', status: 'in_transit' }),
      make({ id: 'd', status: 'cancelled' }),
      make({ id: 'e', status: 'unassigned' }),
    ];

    expect(selectActiveDeliveries(items).map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('orders newest first (AC-3)', () => {
    const items = [
      make({ id: 'old', createdAt: 1000 }),
      make({ id: 'new', createdAt: 3000 }),
      make({ id: 'mid', createdAt: 2000 }),
    ];

    expect(selectActiveDeliveries(items).map((d) => d.id)).toEqual(['new', 'mid', 'old']);
  });
});
