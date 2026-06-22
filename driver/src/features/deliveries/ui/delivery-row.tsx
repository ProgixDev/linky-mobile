import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';
import { AppText, Card } from '@/shared/ui';

import type { Delivery } from '../model/schema';

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Assigned',
  in_transit: 'In transit',
};

function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

type Props = { delivery: Delivery; index: number };

/**
 * One row in the driver's worklist. Shows only the dropoff AREA (city · district)
 * — never the street address (spec 001 AC-10). Tapping routes toward the delivery
 * detail/handoff screen (a separate spec; a placeholder route exists for now).
 */
export function DeliveryRow({ delivery, index }: Props) {
  const reduced = useReducedMotion();
  const inTransit = delivery.status === 'in_transit';
  const area =
    [delivery.dropoffCity, delivery.dropoffDistrict].filter(Boolean).join(' · ') ||
    'Area unavailable';

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.delay(Math.min(index, 8) * 40)}
      testID={`deliveries-row-${delivery.id}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open delivery ${delivery.orderRef}`}
        onPress={() => router.push({ pathname: '/delivery/[id]', params: { id: delivery.id } })}
      >
        <Card className="mb-3 flex-row gap-3">
          <Image
            source={delivery.itemPhoto ? { uri: delivery.itemPhoto } : undefined}
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              backgroundColor: colors.surfaceMuted,
            }}
            contentFit="cover"
            transition={150}
            accessibilityIgnoresInvertColors
          />
          <View className="flex-1 gap-0.5">
            <View className="flex-row items-center justify-between">
              <AppText
                variant="caption"
                className="text-ink-muted"
                testID={`deliveries-ref-${delivery.id}`}
              >
                {delivery.orderRef}
              </AppText>
              <AppText variant="caption" className="text-ink-faint">
                {timeAgo(delivery.createdAt)}
              </AppText>
            </View>
            <AppText variant="label" numberOfLines={1}>
              {delivery.itemTitle || 'Item'}
            </AppText>
            <AppText variant="caption" numberOfLines={1}>
              {delivery.shopName || 'Shop'}
            </AppText>
            <View className="mt-1 flex-row items-center justify-between">
              <AppText variant="caption" numberOfLines={1} className="flex-1">
                {area}
              </AppText>
              <View
                className={cn(
                  'rounded-full px-2 py-0.5',
                  inTransit ? 'bg-brand-50' : 'bg-surface-muted',
                )}
              >
                <AppText
                  variant="caption"
                  className={cn(inTransit ? 'text-brand-700' : 'text-ink-muted')}
                >
                  {STATUS_LABEL[delivery.status] ?? delivery.status}
                </AppText>
              </View>
            </View>
          </View>
        </Card>
      </Pressable>
    </Animated.View>
  );
}
