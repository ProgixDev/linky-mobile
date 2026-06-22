import { TabSlot, Tabs } from 'expo-router/ui';

import { TabBar, type TabItem } from './tab-bar';

/**
 * Copy this to `src/app/(tabs)/_layout.tsx` and create a matching route file for
 * each tab (e.g. `src/app/(tabs)/index.tsx`, `feed.tsx`, `account.tsx`). Switch
 * the look by changing `variant`. The `name` must match the route segment.
 */
const items: TabItem[] = [
  { name: 'index', href: '/', label: 'Home' },
  { name: 'feed', href: '/feed', label: 'Feed' },
  { name: 'account', href: '/account', label: 'Account' },
  // add up to ~5 tabs; plug icons via item.icon = (focused) => <YourIcon … />
];

export default function TabsLayout() {
  return (
    <Tabs>
      <TabSlot />
      <TabBar items={items} variant="pill" />
    </Tabs>
  );
}
