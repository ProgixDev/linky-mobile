import { FlatList, Pressable, View } from 'react-native';

import { AppText, Screen } from '@/shared/ui';

import { type Slot } from '../model/booking';
import { useBooking } from '../use-booking';

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder: today's
 * slots for a resource; tap an open one to book.
 */
export function BookingScreen({ resourceId }: { resourceId: string }) {
  const { slots, error, reserve } = useBooking(resourceId, new Date());
  return (
    <Screen>
      <View className="flex-1 gap-3">
        <AppText variant="display">Pick a time</AppText>
        {error ? (
          <AppText variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}
        <FlatList
          data={slots}
          keyExtractor={(s: Slot) => s.start}
          numColumns={3}
          renderItem={({ item }) => (
            <Pressable
              testID={`slot-${item.start}`}
              disabled={item.taken}
              onPress={() => void reserve(item)}
              className={
                item.taken
                  ? 'm-1 flex-1 items-center rounded-control bg-surface-muted p-3 opacity-40'
                  : 'm-1 flex-1 items-center rounded-control bg-brand-50 p-3'
              }
            >
              <AppText variant="body">{fmt(item.start)}</AppText>
            </Pressable>
          )}
        />
      </View>
    </Screen>
  );
}
