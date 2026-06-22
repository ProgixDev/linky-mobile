import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { useConversation } from '../use-conversation';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder thread —
 * proves load + realtime + send work. Real bubbles/avatars/etc. drop onto `useConversation`.
 */
export function MessageThread({ conversationId }: { conversationId: string }) {
  const { messages, loading, error, send } = useConversation(conversationId);
  const [draft, setDraft] = useState('');

  const submit = async () => {
    if (!draft.trim()) return;
    const ok = await send(draft);
    if (ok) setDraft('');
  };

  return (
    <Screen>
      <View className="flex-1">
        {loading ? <AppText variant="caption">Loading…</AppText> : null}
        {error ? (
          <AppText variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          className="flex-1"
          renderItem={({ item }) => (
            <View className="mb-2 rounded-card bg-surface-muted p-3">
              <AppText variant="body">{item.body}</AppText>
            </View>
          )}
        />
        <View className="flex-row gap-2 pt-2">
          <TextField
            testID="chat-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            onSubmitEditing={() => void submit()}
          />
          <Button testID="chat-send" label="Send" onPress={() => void submit()} />
        </View>
      </View>
    </Screen>
  );
}
