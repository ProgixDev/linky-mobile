import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/shared/lib/cn';

import { AppText } from './text';

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** Optional icon/illustration slot — apps plug their own icon set here. */
  icon?: ReactNode;
  /** Optional action slot — typically a <Button />. */
  action?: ReactNode;
  className?: string;
  testID?: string;
};

/**
 * Empty state — purpose + one action, never just "no data". A real screen state
 * (first impression of a feature), required by the quality bar. The icon and
 * action are slots so each app stays on-brand without bundling an icon set here.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  testID,
}: EmptyStateProps) {
  return (
    <View
      testID={testID}
      className={cn('flex-1 items-center justify-center gap-3 px-6', className)}
    >
      {icon ? <View className="mb-1">{icon}</View> : null}
      <AppText variant="title" className="text-center">
        {title}
      </AppText>
      {description ? (
        <AppText variant="caption" className="text-center">
          {description}
        </AppText>
      ) : null}
      {action ? <View className="mt-2 w-full max-w-xs">{action}</View> : null}
    </View>
  );
}
