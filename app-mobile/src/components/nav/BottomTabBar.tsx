import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { I, type IconKey } from '../../icons/Icon';
import { haptic } from '../../lib/haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// Custom tab bar with center FAB-style Découvrir tab.
// Used as the tabBar prop of expo-router's <Tabs> when wrapping with react-navigation bottom tabs.
// For expo-router v6, this signature matches `tabBar` from `expo-router`'s Tabs (re-exports react-navigation).
const TAB_ICONS: Record<string, IconKey> = {
  index: 'home',
  marche: 'shop',
  decouvrir: 'sparkle',
  messagerie: 'msg',
  boutique: 'store',
  profil: 'user',
};
const TAB_LABELS: Record<string, string> = {
  index: 'Accueil',
  marche: 'Marché',
  decouvrir: 'Découvrir',
  messagerie: 'Messages',
  boutique: 'Boutique',
  profil: 'Profil',
};
// Phase X.10 (revised) — visual L→R order enforced explicitly (do not rely
// on state.routes ordering, which expo-router may derive from file-system
// alphabetical order rather than the <Tabs.Screen> declaration order).
// Profil stays rightmost ; Découvrir is the centered FAB ; Messagerie is a
// dedicated tab (the header-icon variant of X.10 was rolled back in favor of
// fusing Boutique into Profil — see PHASE_K_V1_1_BACKLOG).
const TAB_ORDER = ['index', 'marche', 'decouvrir', 'messagerie', 'profil'] as const;

export function BottomTabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Respect tabs hidden via `options.href: null` (e.g. role-gated Boutique tab),
  // then enforce TAB_ORDER so Profil is always rightmost regardless of how
  // expo-router resolved state.routes. Routes not in TAB_ORDER are dropped
  // (defense against an orphan file under (tabs)/ silently leaking into the bar).
  const visibleRoutes = state.routes
    .filter((r) => {
      const opts = descriptors[r.key]?.options as { href?: string | null } | undefined;
      return opts?.href !== null;
    })
    .filter((r) => (TAB_ORDER as readonly string[]).includes(r.name))
    .sort(
      (a, b) =>
        (TAB_ORDER as readonly string[]).indexOf(a.name) -
        (TAB_ORDER as readonly string[]).indexOf(b.name),
    );
  const activeRoute = state.routes[state.index];
  const onDiscoverRoute = activeRoute?.name === 'decouvrir';
  const barBg = onDiscoverRoute ? 'rgba(14, 19, 17, 0.92)' : colors.bgElev;
  const borderColor = onDiscoverRoute ? 'rgba(255,255,255,0.08)' : colors.border;

  return (
    <View
      style={{
        backgroundColor: barBg,
        borderTopWidth: 1,
        borderTopColor: borderColor,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 6,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'stretch',
        height: 70 + Math.max(insets.bottom - 8, 0),
      }}
    >
      {visibleRoutes.map((route) => {
        const index = state.routes.findIndex((r) => r.key === route.key);
        const focused = state.index === index;
        const Icon = I[TAB_ICONS[route.name] ?? 'home'];
        const isFab = route.name === 'decouvrir';
        const onPress = () => {
          haptic.selection();
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const activeColor = colors.primary;
        const inactiveColor = onDiscoverRoute ? 'rgba(255,255,255,0.6)' : colors.textFaint;

        if (isFab) {
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'flex-start',
              }}
              accessibilityRole="tab"
              accessibilityLabel={TAB_LABELS[route.name]}
              accessibilityState={{ selected: focused }}
            >
              <View
                style={{
                  marginTop: -18,
                  width: 52,
                  height: 52,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: colors.primary,
                  shadowOpacity: 0.4,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 8,
                }}
              >
                <Compass size={24} color="#FFFFFF" strokeWidth={1.75} />
              </View>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  fontWeight: '500',
                  color: focused ? activeColor : inactiveColor,
                }}
              >
                {TAB_LABELS[route.name]}
              </Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
            }}
            accessibilityRole="tab"
            accessibilityLabel={TAB_LABELS[route.name]}
            accessibilityState={{ selected: focused }}
          >
            <Icon size={22} color={focused ? activeColor : inactiveColor} stroke={focused ? 2 : 1.5} />
            <Text style={{ fontSize: 10, fontWeight: '500', color: focused ? activeColor : inactiveColor }}>
              {TAB_LABELS[route.name]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
