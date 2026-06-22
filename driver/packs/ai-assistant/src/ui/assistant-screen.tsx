import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { useAssistant } from '../use-assistant';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder chat:
 * streams the assistant reply token-by-token and persists history (RLS).
 */
export function AssistantScreen({ conversationId }: { conversationId?: string }) {
  const { messages, streaming, error, send } = useAssistant(conversationId);
  const [draft, setDraft] = useState('');

  const onSend = async () => {
    const text = draft;
    setDraft('');
    await send(text);
  };

  return (
    <Screen>
      <View className="flex-1 gap-2">
        <AppText variant="display">Assistant</AppText>
        <FlatList
          data={messages}
          className="flex-1"
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View
              className={
                item.role === 'user'
                  ? 'mb-2 self-end rounded-card bg-brand-50 p-3'
                  : 'mb-2 self-start rounded-card bg-surface-muted p-3'
              }
            >
              <AppText variant="body">{item.content || '…'}</AppText>
            </View>
          )}
        />
        {error ? (
          <AppText testID="assistant-error" variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}
        <View className="flex-row gap-2 pt-2">
          <TextField
            testID="assistant-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask anything…"
            editable={!streaming}
          />
          <Button label="Send" loading={streaming} onPress={() => void onSend()} />
        </View>
      </View>
    </Screen>
  );
}
