/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Reanimated 4: worklets ship a resolver that swaps native entry points
  // for mockable ones under Jest (official setup for RN 0.85 / Reanimated 4).
  resolver: 'react-native-worklets/jest/resolver.js',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Test files live in __tests__ folders next to the code they test —
  // never inside src/app (Expo Router treats those as routes).
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  // The feature-pack library is parked, opt-in code — don't run its tests as part
  // of the app suite (they run once a pack is installed into src/).
  testPathIgnorePatterns: ['/node_modules/', '/packs/'],
  transformIgnorePatterns: [
    // expo-router 56.2.11 pulls in `standard-navigation`, which ships untranspiled
    // ESM (`import * as React`) — Metro transforms it, but Jest skips node_modules
    // by default, so it must be allowlisted here or the suite fails to parse.
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?(-[a-z-]+)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-native-css-interop|nativewind|@react-native-async-storage/.*|react-native-.*|standard-navigation|zustand)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/**',
    '!src/shared/testing/**',
  ],
  coverageThreshold: {
    global: {
      lines: 60,
      statements: 60,
    },
  },
  clearMocks: true,
};
