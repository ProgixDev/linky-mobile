import { View, type ViewProps } from 'react-native';

import { cn } from '@/shared/lib/cn';

export type CardProps = ViewProps & {
  /** Apply default inner padding (default true). */
  padded?: boolean;
};

/**
 * Surface container. Uses a hairline border (not a heavy shadow) so cards never
 * become "shadow soup", and reads correctly in light + dark via role tokens.
 * See docs/design/quality-bar.md.
 */
export function Card({ padded = true, className, ...rest }: CardProps) {
  return (
    <View
      className={cn(
        'rounded-card border border-ink-faint/15 bg-surface',
        padded && 'p-4',
        className,
      )}
      {...rest}
    />
  );
}
