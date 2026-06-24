import { TabSlot, Tabs } from 'expo-router/ui';

import { DriverTabBar } from '@/features/navigation-tabs';

/**
 * The approved-livreur home shell: a 3-tab bottom nav (Accueil / Carte / Profil).
 * This group sits BEHIND the auth + approval gates (useProtectedRoute +
 * useLivreurGate in the root layout), so only an approved courier ever reaches it.
 * Routes stay THIN — each tab file wires a feature screen.
 */
export default function TabsLayout() {
  return (
    <Tabs>
      <TabSlot />
      <DriverTabBar />
    </Tabs>
  );
}
