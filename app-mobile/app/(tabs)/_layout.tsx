import { Tabs } from 'expo-router';
import { BottomTabBar } from '../../src/components/nav/BottomTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="marche" options={{ title: 'Marché' }} />
      <Tabs.Screen name="decouvrir" options={{ title: 'Découvrir' }} />
      <Tabs.Screen name="messagerie" options={{ title: 'Messages' }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil' }} />
      {/* Boutique tab hidden — mixed users access it via header icon on Home (see app/(tabs)/index.tsx). */}
      <Tabs.Screen name="boutique" options={{ href: null }} />
    </Tabs>
  );
}
