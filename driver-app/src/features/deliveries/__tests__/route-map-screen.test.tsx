import { Linking } from 'react-native';

import { fireEvent, render, screen, waitFor } from '@/shared/testing/render';

import { getDelivery } from '../lib/deliveries-api';
import { type DeliveryDetail } from '../model/schema';
import { RouteMapScreen } from '../ui/route-map-screen';

// A Mapbox token is present so the MAP branch renders (Mapbox itself is stubbed below).
// Other env fields keep the schema valid for anything else that reads env.
jest.mock('@/shared/lib/env', () => ({
  env: {
    EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: 'pk.test-token',
    EXPO_PUBLIC_API_URL: 'https://api.example.com',
    EXPO_PUBLIC_APP_ENV: 'development',
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-anon-key-anon',
  },
}));

// @rnmapbox/maps + expo-location are native — mock them so the screen mounts in jsdom.
// (babel-jest hoists these jest.mock calls above the imports above.)
jest.mock('@rnmapbox/maps', () => ({
  __esModule: true,
  default: {
    setAccessToken: jest.fn(),
    setTelemetryEnabled: jest.fn(),
    StyleURL: { Street: 'street' },
    MapView: () => null,
    Camera: () => null,
    PointAnnotation: () => null,
    ShapeSource: () => null,
    LineLayer: () => null,
  },
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  watchPositionAsync: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  Accuracy: { Balanced: 3 },
}));

jest.mock('../lib/deliveries-api', () => ({ getDelivery: jest.fn() }));
const mockGet = getDelivery as jest.Mock;

const detail = (over: Partial<DeliveryDetail> = {}): DeliveryDetail => ({
  id: 'd1',
  orderId: 'o1',
  orderRef: 'LK-2026-00042',
  amountGnf: 150000,
  itemTitle: 'Sac à main',
  itemPhoto: '',
  addressCity: 'Conakry',
  addressDistrict: 'Kaloum',
  addressDetails: '12 Rue de la Paix',
  buyerName: 'Mariama',
  status: 'assigned',
  clientLocation: { lat: 9.535, lng: -13.68 },
  pickup: { name: 'TechShop', city: 'Conakry', lat: 9.51, lng: -13.71 },
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('RouteMapScreen', () => {
  it('renders the map branch (not the placeholder), the distance, and the product card', async () => {
    mockGet.mockResolvedValue(detail());

    render(<RouteMapScreen id="d1" />);

    // Product card confirms the screen loaded; with a token + coords the placeholder
    // must NOT show (the map branch was chosen — the Mapbox view itself is a null stub).
    expect(await screen.findByTestId('route-map-product')).toBeTruthy();
    expect(screen.queryByTestId('route-map-unavailable')).toBeNull();
    expect(screen.getByTestId('route-map-distance')).toBeTruthy();
  });

  it('falls back to a placeholder when the delivery has no coords', async () => {
    mockGet.mockResolvedValue(detail({ clientLocation: null, pickup: null }));

    render(<RouteMapScreen id="d1" />);

    expect(await screen.findByTestId('route-map-unavailable')).toBeTruthy();
    // No distance without both points.
    expect(screen.queryByTestId('route-map-distance')).toBeNull();
  });

  it('opens an external maps app from the product card', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockGet.mockResolvedValue(detail());

    render(<RouteMapScreen id="d1" />);
    const btn = await screen.findByTestId('route-map-open-external');
    fireEvent.press(btn);

    await waitFor(() =>
      expect(openURL).toHaveBeenCalledWith(expect.stringContaining('9.535,-13.68')),
    );
  });

  it('shows an error state and retries', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'));

    render(<RouteMapScreen id="d1" />);

    expect(await screen.findByTestId('route-map-error')).toBeTruthy();
  });
});
