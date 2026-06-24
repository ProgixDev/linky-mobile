import { type Href } from 'expo-router';
import { type TabTriggerSlotProps } from 'expo-router/ui';
import { Map as MapIcon, Package, User, type LucideIcon } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';
import { AppText } from '@/shared/ui';

export type DriverTab = {
  name: string;
  href: Href;
  label: string;
  Icon: LucideIcon;
  center?: boolean;
};

// Exactly three tabs (spec): Accueil (left) · Carte (center, prominent) · Profil (right).
// Hrefs cast for the cold-tsc typed-routes window (mirrors use-protected-route).
//
// IMPORTANT: the <TabList>/<TabTrigger> that register these screens must be
// LITERAL direct children of expo-router/ui <Tabs> — its child parser only
// descends into Fragments + <TabList>, never a wrapping function component
// (Tabs.js parseTriggersFromChildren). So the layout composes these directly;
// this file only provides the data + the trigger's VISUAL.
export const DRIVER_TABS: DriverTab[] = [
  { name: 'index', href: '/' as Href, label: 'Accueil', Icon: Package },
  { name: 'carte', href: '/carte' as Href, label: 'Carte', Icon: MapIcon, center: true },
  { name: 'profil', href: '/profil' as Href, label: 'Profil', Icon: User },
];

type TriggerProps = TabTriggerSlotProps & { item: DriverTab };

/**
 * Visual for a single tab — rendered via `<TabTrigger asChild>` so it receives
 * `isFocused` + press props. The prominent raised center tab is the live map.
 */
export const DriverTabTrigger = forwardRef<View, TriggerProps>(function DriverTabTrigger(
  { isFocused, item, ...props },
  ref,
) {
  const active = !!isFocused;
  const { Icon } = item;
  const testID = `nav-tab-${item.label.toLowerCase()}`;

  if (item.center) {
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
