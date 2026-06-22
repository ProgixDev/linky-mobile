import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { AppText, Button, Screen } from '@/shared/ui';

import { useReviews } from '../use-reviews';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder: shows the
 * average + count, a 1-5 picker to submit your review, and the list.
 */
export function ReviewsScreen({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { reviews, summary, error, submit } = useReviews(entityType, entityId);
  const [rating, setRating] = useState(0);

  return (
    <Screen>
      <View className="flex-1 gap-3">
        <AppText variant="display">
          {summary.avg_rating.toFixed(1)} ★ ({summary.review_count})
        </AppText>
        <View className="flex-row gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} testID={`star-${n}`} onPress={() => setRating(n)}>
              <AppText variant="title" className={n <= rating ? 'text-brand-600' : 'text-ink-faint'}>
                ★
              </AppText>
            </Pressable>
          ))}
        </View>
        <Button
          label="Submit review"
          onPress={() => {
            void submit(rating);
          }}
        />
        {error ? (
          <AppText variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}
        <FlatList
          data={reviews}
          className="flex-1"
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <View className="border-b border-ink-faint/10 py-2">
              <AppText variant="body">
                {'★'.repeat(item.rating)} {item.body ?? ''}
              </AppText>
            </View>
          )}
        />
      </View>
    </Screen>
  );
}
