import { Clock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';
import { AppText } from '@/shared/ui';

import { formatRemaining, getDeadline, remainingMs, urgency, type Urgency } from '../lib/deadline';

const TICK_MS = 30000; // minute-granularity label → a 30s tick keeps it live + battery-cheap

const TEXT_CLASS: Record<Urgency, string> = {
  normal: 'text-ink-muted',
  soon: 'text-accent',
  urgent: 'text-danger',
  overdue: 'text-danger',
};
const ICON_COLOR: Record<Urgency, string> = {
  normal: colors.inkMuted,
  soon: colors.accent,
  urgent: colors.danger,
  overdue: colors.danger,
};

/**
 * Live deadline countdown for an active delivery — « ⏱ 1h 42m restantes »,
 * decrementing and turning amber → red as it nears zero (red once overdue).
 * Deadline is derived (see lib/deadline) until the backend ships a real one.
 */
export function DeliveryCountdown({ createdAt, testID }: { createdAt: number; testID?: string }) {
  const deadline = getDeadline({ createdAt });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const remaining = remainingMs(deadline, now);
  const band = urgency(remaining);

  return (
    <View
      testID={testID}
      className="flex-row items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5"
    >
      <Clock size={12} color={ICON_COLOR[band]} strokeWidth={2.25} />
      <AppText variant="caption" className={cn('font-sans-medium', TEXT_CLASS[band])}>
        {remaining <= 0 ? 'En retard' : `${formatRemaining(remaining)} restantes`}
      </AppText>
    </View>
  );
}
