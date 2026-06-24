import { type Href } from 'expo-router';
import { TabList, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Map as MapIcon, Package, User, type LucideIcon } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';
import { AppText } from '@/shared/ui';

type Item = { name: string; href: Href; label: string; Icon: LucideIcon; center?: boolean };

// Exactly three tabs (spec): Accueil (left) · Carte (center, prominent) · Profil (right).
// Hrefs cast for the cold-tsc typed-routes window (mirrors use-protected-route).
const ITEMS: Item[] = [
  { name: 'index', href: '/' as Href, label: 'Accueil', Icon: Package },
  { name: 'carte', href: '/carte' as Href, label: 'Carte', Icon: MapIcon, center: true },
  { name: 'profil', href: '/profil' as Href, label: 'Profil', Icon: User },
];

type TriggerProps = TabTriggerSlotProps & { item: Item };

const Trigger = forwardRef<View, TriggerProps>(function Trigger(
  { isFocused, item, ...props },
  ref,
) {
  const active = !!isFocused;
  const { Icon } = item;
  const testID = `nav-tab-${item.label.toLowerCase()}`;

  if (item.center) {
    // Prominent raised center tab for the live map.
    return (
      <Pressable
        ref={ref}
        {...props}
        testID={testID}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={item.label}
        className="flex-1 items-center justify-center"
      >
        <View
          className={cn(
            '-mt-7 h-14 w-14 items-center justify-center rounded-full border-4 border-surface shadow-sm',
            active ? 'bg-brand-600' : 'bg-brand-500',
          )}
        >
          <Icon size={24} color={colors.inkInverse} strokeWidth={2.25} />
        </View>
        <AppText
          variant="caption"
          className={cn('mt-1', active ? 'text-brand-600' : 'text-ink-faint')}
        >
          {item.label}
        </AppText>
      </Pressable>
    );
  }

  return (
    <Pressable
      ref={ref}
      {...props}
      testID={testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      className="flex-1 items-center justify-center gap-1 py-2"
    >
      <Icon size={22} color={active ? colors.brand600 : colors.inkFaint} strokeWidth={2.25} />
      <AppText variant="caption" className={active ? 'text-brand-600' : 'text-ink-faint'}>
        {item.label}
      </AppText>
    </Pressable>
  );
});

/**
 * Linky Driver bottom tab bar — built on the headless expo-router/ui Tabs (the
 * tabbars pack), three tabs with a prominent raised center (Carte / live map).
 * Token-driven (brand/ink/surface), lucide icons.
 */
export function DriverTabBar() {
  const insets = useSafeAreaInsets();
  return (
    <TabList
      testID="driver-tab-bar"
      className="flex-row items-end border-t border-ink-faint/15 bg-surface px-2 pt-1.5"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {ITEMS.map((item) => (
        <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
          <Trigger item={item} />
        </TabTrigger>
      ))}
    </TabList>
  );
}
