import { Tabs } from 'expo-router';
import { BottomTabBar } from '../../src/components/nav/BottomTabBar';

// Phase X.10 (revised 2026-06-12) — 5-tab bar with Messagerie restored as a
// dedicated tab ; Boutique fused into the Profil screen as a hero card so
// it's no longer a hidden tab + Home-header shortcut. Resulting bar order
// (enforced in BottomTabBar) : Accueil, Annonces, Découvrir [FAB], Messagerie,
// Profil. Boutique stays as a Stack route at /(tabs)/boutique reachable from
// the Profil hero card ; the tab itself stays href:null so it never shows in
// the bar regardless of role.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="marche" options={{ title: 'Annonces' }} />
      <Tabs.Screen name="decouvrir" options={{ title: 'Découvrir' }} />
      <Tabs.Screen name="messagerie" options={{ title: 'Messages' }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil' }} />
      <Tabs.Screen name="boutique" options={{ href: null }} />
    </Tabs>
  );
}
