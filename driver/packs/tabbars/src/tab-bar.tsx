import { TabList, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/shared/lib/cn';
import { AppText } from '@/shared/ui';

/** Uses the modern headless expo-router/ui Tabs (SDK 56 — no react-navigation). */
export type TabItem = {
  name: string;
  href: string;
  label: string;
  /** Optional icon — apps plug their own icon set: `(focused) => <Icon … />`. */
  icon?: (focused: boolean) => ReactNode;
};

export type TabVariant = 'minimal' | 'labeled' | 'pill' | 'floating' | 'indicator';

type TriggerProps = TabTriggerSlotProps & {
  label: string;
  icon?: (focused: boolean) => ReactNode;
  variant: TabVariant;
};

const Trigger = forwardRef<View, TriggerProps>(function Trigger(
  { isFocused, label, icon, variant, ...props },
  ref,
) {
  const active = !!isFocused;
  return (
    <Pressable
      ref={ref}
      {...props}
      className={cn(
        'flex-1 items-center justify-center gap-1 py-2',
        variant === 'pill' && active && 'mx-1 rounded-control bg-brand-50',
      )}
    >
      {icon ? icon(active) : null}
      {variant !== 'minimal' ? (
        <AppText variant="caption" className={active ? 'text-brand-600' : 'text-ink-faint'}>
          {label}
        </AppText>
      ) : null}
      {variant === 'indicator' ? (
        <View
          className={cn('h-0.5 w-6 rounded-full', active ? 'bg-brand-600' : 'bg-transparent')}
        />
      ) : null}
    </Pressable>
  );
});

/**
 * A swappable bottom tab bar. Pass `variant` to switch styles:
 *   minimal · labeled · pill · floating · indicator
 * Token-driven (brand/ink/surface roles) — DESIGN: refine after Claude Design.
 */
export function TabBar({ items, variant = 'minimal' }: { items: TabItem[]; variant?: TabVariant }) {
  const insets = useSafeAreaInsets();
  return (
    <TabList
      className={cn(
        'flex-row border-t border-ink-faint/15 bg-surface px-2',
        variant === 'floating' && 'mx-4 mb-2 rounded-card border border-ink-faint/15 shadow-sm',
      )}
      style={{ paddingBottom: variant === 'floating' ? 8 : insets.bottom }}
    >
      {items.map((item) => (
        <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
          <Trigger label={item.label} icon={item.icon} variant={variant} />
        </TabTrigger>
      ))}
    </TabList>
  );
}
