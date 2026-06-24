import { fireEvent, render, screen } from '@/shared/testing/render';

import { fetchDeliveries } from '../lib/deliveries-api';
import type { Delivery } from '../model/schema';
import { useDeliveriesStore } from '../model/store';
import { DeliveriesScreen } from '../ui/deliveries-screen';

// Hoisted above the imports by babel-jest, so the store loads the mocked api.
jest.mock('../lib/deliveries-api', () => ({ fetchDeliveries: jest.fn() }));

const mockFetch = fetchDeliveries as jest.Mock;

const make = (over: Partial<Delivery> = {}): Delivery => ({
  id: 'd1',
  orderRef: 'LK-9',
  itemTitle: 'Blue mug',
  itemPhoto: '',
  shopName: 'Mugs Co',
  dropoffCity: 'Conakry',
  dropoffDistrict: 'Ratoma',
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

afterEach(() => jest.restoreAllMocks());

describe('<DeliveriesScreen />', () => {
  it('shows a loading state, then renders each delivery row (AC-1, AC-8, AC-10)', async () => {
    mockFetch.mockResolvedValue([make()]);

    render(<DeliveriesScreen />);
    expect(screen.getByTestId('deliveries-loading')).toBeOnTheScreen();

    expect(await screen.findByText('Blue mug')).toBeOnTheScreen();
    expect(screen.getByText('LK-9')).toBeOnTheScreen();
    expect(screen.getByText('Mugs Co')).toBeOnTheScreen();
    // Dropoff is AREA only (city · district) — never a street address (AC-10).
    expect(screen.getByText('Conakry · Ratoma')).toBeOnTheScreen();
    expect(screen.getByText('Assignée')).toBeOnTheScreen();
  });

  it('shows the empty state when nothing is assigned (AC-5)', async () => {
    mockFetch.mockResolvedValue([]);

    render(<DeliveriesScreen />);

    expect(await screen.findByTestId('deliveries-empty')).toBeOnTheScreen();
  });

  it('shows an error state with retry that re-fetches (AC-6)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('down'));

    render(<DeliveriesScreen />);
    expect(await screen.findByTestId('deliveries-error')).toBeOnTheScreen();

    mockFetch.mockResolvedValueOnce([make({ itemTitle: 'Recovered item' })]);
    fireEvent.press(screen.getByTestId('deliveries-retry'));

    expect(await screen.findByText('Recovered item')).toBeOnTheScreen();
  });

  it('defers the initial load until the persisted cache has rehydrated (AC-7/AC-8)', () => {
    const loadSpy = jest.spyOn(useDeliveriesStore.getState(), 'load').mockResolvedValue(undefined);
    jest.spyOn(useDeliveriesStore.persist, 'hasHydrated').mockReturnValue(false);
    let finishHydration = () => {};
    jest.spyOn(useDeliveriesStore.persist, 'onFinishHydration').mockImplementation((cb) => {
      finishHydration = cb as () => void;
      return () => {};
    });

    render(<DeliveriesScreen />);
    // No fetch before the cache has rehydrated — otherwise an offline cold start
    // would skeleton/error instead of showing the cached list.
    expect(loadSpy).not.toHaveBeenCalled();

    finishHydration();
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the cached list with a stale banner when a refresh fails offline (AC-7)', async () => {
    useDeliveriesStore.setState({
      items: [make({ itemTitle: 'Cached item' })],
      status: 'success',
      lastFetchedAt: 1,
    });
    mockFetch.mockRejectedValueOnce(new Error('offline'));

    render(<DeliveriesScreen />);

    expect(await screen.findByTestId('deliveries-stale-banner')).toBeOnTheScreen();
    expect(screen.getByText('Cached item')).toBeOnTheScreen();
  });
});
