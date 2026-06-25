import { type Href } from 'expo-router';
import { type TabTriggerSlotProps } from 'expo-router/ui';
import { Map as MapIcon, Package, User, type LucideIcon } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

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

// why: expo-router/ui's TabTrigger slot injects an INLINE style ({ flexDirection:'row',
// justifyContent:'space-between' }) via the slot props, and an explicit style prop beats
// NativeWind's className — that's why a className-only "flex-col" never took (icon stayed
// BESIDE the label, tabs spaced unevenly, « Profil » truncated). We set the layout via an
// explicit `style` object so it actually wins: each tab is an even 1/3 COLUMN (icon on
// top, label below, bottom-aligned). This is the one place inline style is required.
const TAB_STYLE: ViewStyle = {
  flex: 1,
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 4,
  paddingTop: 8,
  paddingBottom: 6,
};

/**
 * Visual for a single tab — rendered via `<TabTrigger asChild>`. Three even 1/3 columns,
 * icon on top + label below (layout via TAB_STYLE — see the note above for why it's
 * inline). The center (Carte) is the prominent raised round green button; its label still
 * sits on the shared bottom baseline with the others.
 */
export const DriverTabTrigger = forwardRef<View, TriggerProps>(
  function DriverTabTrigger(props, ref) {
    const { isFocused, item, ...rest } = props;
    const active = !!isFocused;
    const { Icon } = item;
    const testID = `nav-tab-${item.label.toLowerCase()}`;
    const tint = active ? colors.brand600 : colors.inkFaint;

    return (
      <Pressable
        ref={ref}
        {...rest}
        // Override the slot's injected row style with the column layout (TAB_STYLE).
        style={TAB_STYLE}
        testID={testID}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={item.label}
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
          className={cn('text-[11px] leading-tight', active ? 'text-brand-600' : 'text-ink-faint')}
        >
          {item.label}
        </AppText>
      </Pressable>
    );
  },
);
