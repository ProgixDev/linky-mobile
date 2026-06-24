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
// A fixed 3-tuple (not DriverTab[]) so the layout can index DRIVER_TABS[0..2]
// without `| undefined` under noUncheckedIndexedAccess — the triggers are declared
// literally there (the parser needs static <TabTrigger> elements).
export const DRIVER_TABS: readonly [DriverTab, DriverTab, DriverTab] = [
  { name: 'index', href: '/' as Href, label: 'Accueil', Icon: Package },
  { name: 'carte', href: '/carte' as Href, label: 'Carte', Icon: MapIcon, center: true },
  { name: 'profil', href: '/profil' as Href, label: 'Profil', Icon: User },
];

type TriggerProps = TabTriggerSlotProps & { item: DriverTab };

/**
 * Visual for a single tab — rendered via `<TabTrigger asChild>` so it receives
 * `isFocused` + press props. ONE column shape for all three (flex-1, icon-area on
 * top, label baseline-aligned at the bottom via justify-end) so the three tabs are
 * evenly spaced (each 1/3) with every icon over ITS OWN label. The center (Carte) is
 * the prominent raised round green button; its label still sits on the shared baseline.
 */
export const DriverTabTrigger = forwardRef<View, TriggerProps>(function DriverTabTrigger(
  { isFocused, item, ...props },
  ref,
) {
  const active = !!isFocused;
  const { Icon } = item;
  const testID = `nav-tab-${item.label.toLowerCase()}`;
  const tint = active ? colors.brand600 : colors.inkFaint;

  return (
    <Pressable
      ref={ref}
      {...props}
      testID={testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      className="flex-1 items-center justify-end gap-1 pb-1 pt-2"
    >
      {item.center ? (
        <View
          className={cn(
            // Raised circle floats above the bar; the label below stays on the baseline.
            '-mt-9 h-14 w-14 items-center justify-center rounded-full border-4 border-surface shadow-md',
            active ? 'bg-brand-600' : 'bg-brand-500',
          )}
        >
          <Icon size={26} color={colors.inkInverse} strokeWidth={2.5} />
        </View>
      ) : (
        <Icon size={24} color={tint} strokeWidth={2.25} />
      )}
      <AppText
        variant="caption"
        numberOfLines={1}
        className={cn('text-[11px]', active ? 'text-brand-600' : 'text-ink-faint')}
      >
        {item.label}
      </AppText>
    </Pressable>
  );
});
