import { Text, type TextProps } from 'react-native';

import { cn } from '@/shared/lib/cn';

type Variant = 'display' | 'title' | 'body' | 'caption' | 'label';

const variantClasses: Record<Variant, string> = {
  display: 'font-sans-bold text-3xl text-ink',
  title: 'font-sans-semibold text-xl text-ink',
  body: 'font-sans text-base text-ink',
  caption: 'font-sans text-sm text-ink-muted',
  label: 'font-sans-medium text-sm text-ink',
};

export type AppTextProps = TextProps & {
  variant?: Variant;
};

/**
 * The only Text component allowed in app code — it guarantees the Inter
 * font scale and typography rules from docs/conventions/design-system.md.
 * (Raw `Text` from react-native is reserved for shared/ui internals.)
 */
export function AppText({ variant = 'body', className, ...rest }: AppTextProps) {
  return <Text className={cn(variantClasses[variant], className)} {...rest} />;
}
