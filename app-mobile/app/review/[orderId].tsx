// Buyer review form — rate the shop (1–5 stars + optional comment) after a completed
// order. Submits via useSubmitReview (→ create-review); the server validates the order
// is the caller's and completed. On success, back to the order, where the CTA is gone
// (get-order now returns hasReviewed: true).
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';

import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { TopBar } from '../../src/components/nav/TopBar';
import { DetailStateScreen } from '../../src/components/feedback/DetailState';
import { StarRating } from '../../src/components/reviews/StarRating';
import { useOrder, useSubmitReview } from '../../src/data/queries';

export default function ReviewRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { colors } = useTheme();
  const { data: order, isLoading, isError, refetch } = useOrder(orderId);
  const submit = useSubmitReview();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  if (isLoading || isError || !order) {
    return (
      <DetailStateScreen
        loading={isLoading}
        title="Commande indisponible"
        onRetry={() => void refetch()}
      />
    );
  }

  const onSubmit = async () => {
    if (rating < 1 || submit.isPending) return;
    try {
      await submit.mutateAsync({
        orderId: order.id,
        shopId: order.shopId,
        rating,
        comment: comment.trim() || undefined,
      });
      router.back();
    } catch {
      // surfaced inline below via submit.isError
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Noter la boutique" back subtitle={`#${order.reference}`} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 22 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          variant="bodyM"
          tone="muted"
          center
          style={{ letterSpacing: 0, textTransform: 'none' }}
        >
          Comment s'est passée ta commande ? Ton avis aide les autres acheteurs.
        </Text>

        <StarRating value={rating} onChange={setRating} />

        <View style={{ gap: 8 }}>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
            Ton avis (optionnel)
          </Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Partage ton expérience…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            style={{
              minHeight: 110,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              color: colors.text,
              textAlignVertical: 'top',
              backgroundColor: colors.card,
            }}
          />
        </View>

        {submit.isError ? (
          <Text tone="danger" variant="micro" style={{ letterSpacing: 0, textTransform: 'none' }}>
            Impossible d'envoyer ton avis pour le moment. Réessaie.
          </Text>
        ) : null}

        <Button
          label="Envoyer mon avis"
          block
          variant="primary"
          disabled={rating < 1 || submit.isPending}
          loading={submit.isPending}
          onPress={() => void onSubmit()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
