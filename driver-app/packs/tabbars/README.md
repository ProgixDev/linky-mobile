# Pack: tabbars

Swappable bottom **tab bars** — 5 variants in one token-driven component — built on the modern
**headless `expo-router/ui` Tabs** (SDK 56; no react-navigation, which the skeleton bans). Key-free.

## Variants

`minimal` (icons only) · `labeled` (icon + label) · `pill` (active pill) · `floating` (detached
rounded bar) · `indicator` (active underline). Switch with one prop.

## Install

```
/add-feature tabbars
```

Then copy the layout into your routes and pick a variant:

```tsx
// src/app/(tabs)/_layout.tsx
import { Tabs, TabSlot } from 'expo-router/ui';
import { TabBar, type TabItem } from '@/features/navigation-tabs';

const items: TabItem[] = [
  { name: 'index', href: '/', label: 'Home', icon: (f) => <YourIcon name="home" focused={f} /> },
  { name: 'feed', href: '/feed', label: 'Feed' },
  { name: 'account', href: '/account', label: 'Account' },
];

export default function TabsLayout() {
  return (
    <Tabs>
      <TabSlot />
      <TabBar items={items} variant="floating" />
    </Tabs>
  );
}
```

Create a route file per tab (`(tabs)/index.tsx`, `(tabs)/feed.tsx`, …). `name` matches the segment.

## Notes

- **Icons are app-provided** — the skeleton ships no icon set on purpose (pick Lucide / SF Symbols /
  your own and pass via `item.icon`). One set, one weight (`docs/design/quality-bar.md`).
- All styling uses **role tokens** (brand/ink/surface) — no hardcoded hex — so it rebrands with the
  theme. Refine after the Claude Design pass.
- Respects the safe-area inset at the bottom; floating variant detaches with a shadow.
- The `TabTrigger` focused state comes from `expo-router/ui` (`TabTriggerSlotProps.isFocused`); if a
  future expo-router version tweaks that prop, adjust `Trigger` in `tab-bar.tsx`.
