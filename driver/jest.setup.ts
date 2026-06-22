/**
 * Global Jest setup. Keep this file small — feature-specific mocks belong
 * next to the feature's tests.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

// Official AsyncStorage in-memory mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Reanimated ships an official Jest integration (v3.6+ / v4).
require('react-native-reanimated').setUpTests();
