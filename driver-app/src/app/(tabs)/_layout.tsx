import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DRIVER_TABS, DriverTabTrigger } from '@/features/navigation-tabs';

/**
 * The approved-livreur home shell: a 3-tab bottom nav (Accueil / Carte / Profil).
 * This group sits BEHIND the auth + approval gates (useProtectedRoute +
 * useLivreurGate in the root layout), so only an approved courier ever reaches it.
 *
 * The <TabList> + <TabTrigger>s MUST be literal direct children of <Tabs> — the
 * expo-router/ui child parser only descends into Fragments + <TabList>, never a
 * wrapping component (that was the "Couldn't find any screens" crash). The feature
 * supplies the tab data + the trigger visual; routes stay otherwise thin.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs>
      <TabSlot />
      <TabList
        testID="driver-tab-bar"
        className="flex-row items-end border-t border-ink-faint/15 bg-surface px-2 pt-1.5"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        {DRIVER_TABS.map((item) => (
          <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
            <DriverTabTrigger item={item} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}
