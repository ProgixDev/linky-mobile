import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { useComments } from '../use-comments';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder thread:
 * paginated comments + optimistic add. Pass the entity to attach comments to.
 */
export function CommentsScreen({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { comments, error, hasMore, loadMore, post } = useComments(entityType, entityId);
  const [draft, setDraft] = useState('');

  const onSend = async () => {
    const body = draft;
    setDraft('');
    await post(body);
  };

  return (
    <Screen>
      <View className="flex-1 gap-2">
        <AppText variant="display">Comments</AppText>
        <FlatList
          data={comments}
          className="flex-1"
          keyExtractor={(c) => c.id}
          onEndReached={() => hasMore && loadMore()}
          renderItem={({ item }) => (
            <View className="border-b border-ink-faint/10 py-2">
              <AppText variant="body">{item.body}</AppText>
            </View>
          )}
        />
        {error ? (
          <AppText variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}
        <View className="flex-row gap-2 pt-2">
          <TextField
            testID="comment-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment…"
          />
          <Button label="Post" onPress={() => void onSend()} />
        </View>
      </View>
    </Screen>
  );
}
