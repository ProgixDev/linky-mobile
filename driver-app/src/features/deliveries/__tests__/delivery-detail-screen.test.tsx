import { act, fireEvent, render, screen } from '@/shared/testing/render';

import { confirmHandoff, fetchDeliveries, getDelivery } from '../lib/deliveries-api';
import type { Delivery, DeliveryDetail } from '../model/schema';
import { useDeliveriesStore } from '../model/store';
import { DeliveryDetailScreen } from '../ui/delivery-detail-screen';

jest.mock('../lib/deliveries-api', () => ({
  getDelivery: jest.fn(),
  confirmHandoff: jest.fn(),
  // The detail screen reconciles the worklist with a background refresh on success.
  fetchDeliveries: jest.fn(),
}));

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

// Controllable expo-camera mock. `mock`-prefixed so jest allows the factory to close
// over it; tests flip the permission and fire a scan through the captured
// onBarcodeScanned handler.
const mockCamera = {
  permission: { granted: true, canAskAgain: true } as {
    granted: boolean;
    canAskAgain: boolean;
  } | null,
  requestPermission: jest.fn(),
  onBarcodeScanned: undefined as ((e: { data: string }) => void) | undefined,
};

// CameraView returns null (we only need to capture onBarcodeScanned). It must NOT
// require react-native here — that pulls NativeWind's _ReactNativeCSSInterop global,
// which the jest.mock hoist guard rejects. The scanner SCREEN (deliveries-scanner)
// still renders around it, so tests assert on that.
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockCamera.permission, mockCamera.requestPermission],
  CameraView: (props: { onBarcodeScanned?: (e: { data: string }) => void }) => {
    mockCamera.onBarcodeScanned = props.onBarcodeScanned;
    return null;
  },
}));

const mockGet = getDelivery as jest.Mock;
const mockConfirm = confirmHandoff as jest.Mock;

const ORDER_UUID = '11111111-1111-4111-8111-111111111111';
const TOKEN_UUID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORDER_UUID = '33333333-3333-4333-8333-333333333333';
const VALID_QR = `linky://order/${ORDER_UUID}/confirm?token=${TOKEN_UUID}`;
const OTHER_QR = `linky://order/${OTHER_ORDER_UUID}/confirm?token=${TOKEN_UUID}`;

const DETAIL: DeliveryDetail = {
  id: 'd1',
  orderId: ORDER_UUID,
  orderRef: 'LK-2026-00042',
  amountGnf: 150000,
  itemTitle: 'Blue mug',
  itemPhoto: '',
  addressCity: 'Conakry',
  addressDistrict: 'Kaloum',
  addressDetails: '12 Rue de la Paix',
  buyerName: 'Mariama',
  status: 'assigned',
};

const listItem = (over: Partial<Delivery> = {}): Delivery => ({
  id: 'd1',
  orderRef: 'LK-2026-00042',
  itemTitle: 'Blue mug',
  itemPhoto: '',
  shopName: 'TechShop',
  dropoffCity: 'Conakry',
  dropoffDistrict: 'Kaloum',
  status: 'assigned',
  createdAt: 1000,
  ...over,
});

const initial = useDeliveriesStore.getState();

beforeEach(() => {
  mockGet.mockReset();
  mockConfirm.mockReset();
  (fetchDeliveries as jest.Mock).mockReset().mockResolvedValue([]);
  mockCamera.permission = { granted: true, canAskAgain: true };
  mockCamera.requestPermission.mockReset();
  mockCamera.onBarcodeScanned = undefined;
  useDeliveriesStore.setState(initial, true);
  useDeliveriesStore.setState({ items: [listItem()], status: 'success', error: null });
});

afterEach(() => jest.restoreAllMocks());

// Drive the screen to the `review` phase via a valid scan of THIS order's QR.
async function reachReview() {
  fireEvent.press(await screen.findByTestId('delivery-detail-scan-button'));
  await screen.findByTestId('deliveries-scanner');
  act(() => mockCamera.onBarcodeScanned?.({ data: VALID_QR }));
  await screen.findByTestId('delivery-detail-review');
}

describe('<DeliveryDetailScreen />', () => {
  it('loads and shows ref, item, full street address, buyer name, status (AC-1)', async () => {
    mockGet.mockResolvedValue(DETAIL);

    render(<DeliveryDetailScreen id="d1" />);
    expect(screen.getByTestId('delivery-detail-loading')).toBeOnTheScreen();

    expect(await screen.findByTestId('delivery-detail')).toBeOnTheScreen();
    expect(screen.getByText('LK-2026-00042')).toBeOnTheScreen();
    expect(screen.getByText('Blue mug')).toBeOnTheScreen();
    expect(screen.getByText('Mariama')).toBeOnTheScreen();
    // Detail reveals the FULL street address (unlike the list's area-only view).
    expect(screen.getByTestId('delivery-detail-address')).toHaveTextContent(/12 Rue de la Paix/);
    expect(screen.getByTestId('delivery-detail-status')).toHaveTextContent('Assignée');
    expect(mockGet).toHaveBeenCalledWith('d1');
  });

  it('opens the camera scanner from the detail screen (AC-2)', async () => {
    mockGet.mockResolvedValue(DETAIL);

    render(<DeliveryDetailScreen id="d1" />);
    fireEvent.press(await screen.findByTestId('delivery-detail-scan-button'));

    expect(await screen.findByTestId('deliveries-scanner')).toBeOnTheScreen();
  });

  it('a valid scan shows a review and does NOT release until Confirm is tapped (AC-3)', async () => {
    mockGet.mockResolvedValue(DETAIL);

    render(<DeliveryDetailScreen id="d1" />);
    await reachReview();

    // The scan alone must not call the server.
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('delivery-detail-confirm-button')).toBeOnTheScreen();
  });

  it('confirming releases payment, shows success, and drops it from the list (AC-4)', async () => {
    mockGet.mockResolvedValue(DETAIL);
    mockConfirm.mockResolvedValue({ kind: 'success', orderStatus: 'released' });

    render(<DeliveryDetailScreen id="d1" />);
    await reachReview();
    fireEvent.press(screen.getByTestId('delivery-detail-confirm-button'));

    expect(await screen.findByTestId('delivery-detail-success')).toBeOnTheScreen();
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_UUID, scanToken: TOKEN_UUID }),
    );
    // A stable idempotency key is minted once at scan time and threaded to confirm.
    expect((mockConfirm.mock.calls[0]?.[0] as { idempotencyKey?: string })?.idempotencyKey).toEqual(
      expect.any(String),
    );
    expect(useDeliveriesStore.getState().items.find((d) => d.id === 'd1')).toBeUndefined();
  });

  it('ignores a double-tap on Confirm — releases exactly once (debounce, P1)', async () => {
    mockGet.mockResolvedValue(DETAIL);
    let resolveConfirm: (v: unknown) => void = () => {};
    mockConfirm.mockReturnValue(
      new Promise((r) => {
        resolveConfirm = r;
      }),
    );

    render(<DeliveryDetailScreen id="d1" />);
    await reachReview();
    // First tap → confirming; the button swaps to a disabled no-op. A second tap must
    // not fire a second release (server is idempotent, but the client guards too).
    fireEvent.press(screen.getByTestId('delivery-detail-confirm-button'));
    fireEvent.press(screen.getByTestId('delivery-detail-confirm-button'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);

    resolveConfirm({ kind: 'success', orderStatus: 'released' });
    expect(await screen.findByTestId('delivery-detail-success')).toBeOnTheScreen();
  });

  it('a QR for another order is rejected and releases nothing (AC-5)', async () => {
    mockGet.mockResolvedValue(DETAIL);

    render(<DeliveryDetailScreen id="d1" />);
    fireEvent.press(await screen.findByTestId('delivery-detail-scan-button'));
    await screen.findByTestId('deliveries-scanner');
    act(() => mockCamera.onBarcodeScanned?.({ data: OTHER_QR }));

    expect(await screen.findByTestId('delivery-detail-mismatch')).toBeOnTheScreen();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(useDeliveriesStore.getState().items.find((d) => d.id === 'd1')).toBeDefined();
  });

  it('a server-rejected token shows the mismatch state, releasing nothing (AC-5)', async () => {
    mockGet.mockResolvedValue(DETAIL);
    mockConfirm.mockResolvedValue({ kind: 'mismatch' });

    render(<DeliveryDetailScreen id="d1" />);
    await reachReview();
    fireEvent.press(screen.getByTestId('delivery-detail-confirm-button'));

    expect(await screen.findByTestId('delivery-detail-mismatch')).toBeOnTheScreen();
    expect(useDeliveriesStore.getState().items.find((d) => d.id === 'd1')).toBeDefined();
  });

  it('explains and offers enable/retry when camera permission is denied — no dead end (AC-6)', async () => {
    mockGet.mockResolvedValue(DETAIL);
    mockCamera.permission = { granted: false, canAskAgain: true };

    render(<DeliveryDetailScreen id="d1" />);
    fireEvent.press(await screen.findByTestId('delivery-detail-scan-button'));

    expect(await screen.findByTestId('deliveries-scanner-permission')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('deliveries-scanner-enable'));
    expect(mockCamera.requestPermission).toHaveBeenCalled();
    // Not a dead end — a cancel path is always present.
    expect(screen.getByTestId('deliveries-scanner-cancel')).toBeOnTheScreen();
  });

  it('points a permanently-denied driver to Settings (AC-6)', async () => {
    mockGet.mockResolvedValue(DETAIL);
    mockCamera.permission = { granted: false, canAskAgain: false };

    render(<DeliveryDetailScreen id="d1" />);
    fireEvent.press(await screen.findByTestId('delivery-detail-scan-button'));

    expect(await screen.findByTestId('deliveries-scanner-settings')).toBeOnTheScreen();
  });

  it('blocks confirm when offline and retries on reconnect (AC-7)', async () => {
    mockGet.mockResolvedValue(DETAIL);
    mockConfirm.mockResolvedValueOnce({ kind: 'offline' });

    render(<DeliveryDetailScreen id="d1" />);
    await reachReview();
    fireEvent.press(screen.getByTestId('delivery-detail-confirm-button'));

    expect(await screen.findByTestId('delivery-detail-offline')).toBeOnTheScreen();
    // Nothing released while offline.
    expect(useDeliveriesStore.getState().items.find((d) => d.id === 'd1')).toBeDefined();

    // Reconnect → retry succeeds.
    mockConfirm.mockResolvedValueOnce({ kind: 'success', orderStatus: 'released' });
    fireEvent.press(screen.getByTestId('delivery-detail-offline-retry'));

    expect(await screen.findByTestId('delivery-detail-success')).toBeOnTheScreen();
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  it('tells the driver when the delivery is already completed (AC-8)', async () => {
    mockGet.mockResolvedValue(DETAIL);
    mockConfirm.mockResolvedValue({ kind: 'already_done' });

    render(<DeliveryDetailScreen id="d1" />);
    await reachReview();
    fireEvent.press(screen.getByTestId('delivery-detail-confirm-button'));

    expect(await screen.findByTestId('delivery-detail-already-done')).toBeOnTheScreen();
    expect(useDeliveriesStore.getState().items.find((d) => d.id === 'd1')).toBeDefined();
  });

  it('a lost-response retry after the release already happened lands on already-done, never a second release (AC-8)', async () => {
    mockGet.mockResolvedValue(DETAIL);
    // The first confirm actually releases server-side but the response is dropped → offline.
    mockConfirm.mockResolvedValueOnce({ kind: 'offline' });

    render(<DeliveryDetailScreen id="d1" />);
    await reachReview();
    fireEvent.press(screen.getByTestId('delivery-detail-confirm-button'));
    expect(await screen.findByTestId('delivery-detail-offline')).toBeOnTheScreen();

    // Reconnect → the retry hits the idempotent server, which reports the order is already
    // released (INVALID_STATUS → already_done). It must NOT show success or remove the item
    // a second time — the money action stays released-once.
    mockConfirm.mockResolvedValueOnce({ kind: 'already_done' });
    fireEvent.press(screen.getByTestId('delivery-detail-offline-retry'));

    expect(await screen.findByTestId('delivery-detail-already-done')).toBeOnTheScreen();
    expect(screen.queryByTestId('delivery-detail-success')).toBeNull();
    expect(useDeliveriesStore.getState().items.find((d) => d.id === 'd1')).toBeDefined();
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  it('shows a load error with retry when the detail fetch fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('down'));

    render(<DeliveryDetailScreen id="d1" />);
    expect(await screen.findByTestId('delivery-detail-load-error')).toBeOnTheScreen();

    mockGet.mockResolvedValueOnce(DETAIL);
    fireEvent.press(screen.getByTestId('delivery-detail-load-retry'));
    expect(await screen.findByTestId('delivery-detail')).toBeOnTheScreen();
  });
});
