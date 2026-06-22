import { FlatList, Pressable, View } from 'react-native';

import { AppText, Button, Screen } from '@/shared/ui';

import { type Notification } from '../model/notification';
import { useInbox } from '../use-inbox';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder inbox:
 * realtime list, unread emphasis, tap-to-read, mark-all-read.
 */
export function InboxScreen({ onOpen }: { onOpen?: (n: Notification) => void }) {
  const { items, unread, open, readAll } = useInbox();
  return (
    <Screen>
      <View className="flex-1 gap-2">
        <View className="flex-row items-center justify-between">
          <AppText variant="display">Inbox{unread ? ` (${unread})` : ''}</AppText>
          {unread ? <Button label="Mark all read" onPress={() => void readAll()} /> : null}
        </View>
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => (
            <Pressable
              testID={`inbox-${item.id}`}
              onPress={() => {
                void open(item);
                onOpen?.(item);
              }}
              className={
                item.read_at
                  ? 'border-b border-ink-faint/10 py-3'
                  : 'border-b border-ink-faint/10 bg-brand-50/40 py-3'
              }
            >
              <AppText variant="body">{item.body}</AppText>
            </Pressable>
          )}
        />
      </View>
    </Screen>
  );
}
