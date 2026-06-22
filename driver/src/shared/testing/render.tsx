import { render as rtlRender } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

/**
 * App-aware render: wraps components in the same providers the real app
 * uses. Always import `render` from here, not from the library directly.
 *
 * `initialMetrics` is the official safe-area testing affordance — without
 * it the provider waits for native measurements that never arrive in Jest.
 */
const testMetrics: Metrics = {
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

export function render(ui: ReactElement) {
  return rtlRender(<SafeAreaProvider initialMetrics={testMetrics}>{ui}</SafeAreaProvider>);
}

export * from '@testing-library/react-native';
