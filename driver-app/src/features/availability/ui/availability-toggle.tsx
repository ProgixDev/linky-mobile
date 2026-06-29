import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/shared/lib/cn';
import { AppText } from '@/shared/ui';

import { useAvailabilityStore } from '../model/store';

/**
 * Compact online/offline pill for the home header. The courier taps it to signal
 * availability to dispatch (users.is_online). Optimistic — the pill flips instantly,
 * reverting only if the server rejects. Loads the persisted state on mount.
 */
export function AvailabilityToggle() {
  const online = useAvailabilityStore((s) => s.online);
  const loading = useAvailabilityStore((s) => s.loading);
  const pending = useAvailabilityStore((s) => s.pending);
  const load = useAvailabilityStore((s) => s.load);
  const setOnline = useAvailabilityStore((s) => s.setOnline);

  useEffect(() => {
    void load();
  }, [load]);

  const isOnline = online === true;
  const label = online === null ? '…' : isOnline ? 'En ligne' : 'Hors ligne';

  return (
    <Pressable
      testID="availability-toggle"
      accessibilityRole="switch"
      accessibilityLabel="Disponibilité livreur"
      accessibilityState={{ checked: isOnline, disabled: loading || pending }}
      disabled={loading || pending}
      onPress={() => void setOnline(!isOnline)}
      className={cn(
        'flex-row items-center gap-1.5 rounded-full px-3 py-1.5',
        isOnline ? 'bg-brand-50' : 'bg-surface-muted',
      )}
    >
      <View
        testID="availability-dot"
        className={cn('h-2 w-2 rounded-full', isOnline ? 'bg-brand-600' : 'bg-ink-faint')}
      />
      <AppText
        variant="caption"
        className={cn('font-sans-medium', isOnline ? 'text-brand-700' : 'text-ink-muted')}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
