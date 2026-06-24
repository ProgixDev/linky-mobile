import { render, screen } from '@/shared/testing/render';

import { MapScreen } from '../ui/map-screen';

// @rnmapbox/maps + expo-location are native — mock them so the screen mounts in jsdom.
// (babel-jest hoists these jest.mock calls above the imports above.)
jest.mock('@rnmapbox/maps', () => ({
  __esModule: true,
  default: {
    setAccessToken: jest.fn(),
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
  getLastKnownPositionAsync: jest.fn().mockResolvedValue(null),
  watchPositionAsync: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  Accuracy: { Balanced: 3 },
}));

describe('<MapScreen />', () => {
  it('mounts and degrades to the no-token state when Mapbox is unconfigured (test env)', () => {
    // The test env has no EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN, so the screen should show
    // its honest fallback rather than crash importing the native map.
    render(<MapScreen deliveries={[]} />);
    expect(screen.getByTestId('map-no-token')).toBeOnTheScreen();
  });
});
