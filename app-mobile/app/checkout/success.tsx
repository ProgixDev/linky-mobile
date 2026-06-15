import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check, Package, Clock, ShieldCheck, Receipt } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { haptic } from '../../src/lib/haptics';
import { useOrder } from '../../src/data/queries';
import { formatGNF } from '../../src/lib/format';

export default function CheckoutSuccess() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const { data: order } = useOrder(orderId);

  const checkScale = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  useEffect(() => {
    haptic.success();
    checkScale.value = withSequence(
      withTiming(0, { duration: 0 }),
      withSpring(1, { damping: 9, stiffness: 140, mass: 0.7 }),
    );
    ringScale.value = withDelay(120, withTiming(1.6, { duration: 700, easing: Easing.out(Easing.quad) }));
    ringOpacity.value = withSequence(
      withDelay(120, withTiming(1, { duration: 60 })),
      withTiming(0, { duration: 640, easing: Easing.out(Easing.quad) }),
    );
  }, [checkScale, ringOpacity, ringScale]);

  if (!order) return <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: 40 }}>
          {/* Animated check */}
          <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 120,
                  height: 120,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                },
                ringStyle,
              ]}
            />
            <Animated.View
              style={[
                {
                  width: 92,
                  height: 92,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: colors.primary,
                  shadowOpacity: 0.35,
                  shadowRadius: 22,
                  shadowOffset: { width: 0, height: 12 },
                  elevation: 10,
                },
                checkStyle,
              ]}
            >
              <Check size={44} color="#FFFFFF" strokeWidth={3} />
            </Animated.View>
          </View>

          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              color: colors.text,
              marginTop: 26,
              letterSpacing: -0.4,
              textAlign: 'center',
              lineHeight: 32,
            }}
          >
            {t('checkout.successTitle')}
          </Text>
          <Text
            style={{
              fontSize: 14.5,
              color: colors.textMuted,
              marginTop: 10,
              textAlign: 'center',
              maxWidth: 320,
              lineHeight: 21,
              letterSpacing: 0,
            }}
          >
            {t('checkout.successSub')}
          </Text>

          {/* Order summary card */}
          <View
            style={{
              marginTop: 28,
              padding: 18,
              borderRadius: 22,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              width: '100%',
              gap: 14,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.textFaint,
                  letterSpacing: 0.5,
                }}
              >
                {t('checkout.successNumberLabel')}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.text,
                  fontVariant: ['tabular-nums'],
                  letterSpacing: 0.5,
                }}
              >
                {order.reference}
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <SummaryLine
              Icon={Receipt}
              label={t('checkout.successTotal')}
              value={formatGNF(order.totalGnf)}
              valueBold
            />
            <SummaryLine
              Icon={Package}
              label={t('checkout.successPreparation')}
              value={t('checkout.successPreparationValue')}
            />
            <SummaryLine
              Icon={Clock}
              label={t('checkout.successAutoRelease')}
              value={t('checkout.successAutoReleaseValue')}
            />
            <View
              style={{
                marginTop: 4,
                padding: 12,
                borderRadius: 12,
                backgroundColor: colors.primarySoft,
                flexDirection: 'row',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <ShieldCheck size={13} color={colors.primary} strokeWidth={2.25} style={{ marginTop: 1 }} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: colors.primaryDeep,
                  lineHeight: 17,
                  letterSpacing: 0,
                }}
              >
                {t('checkout.openDispute')}
              </Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={{ paddingHorizontal: 24, paddingTop: 24, gap: 10 }}>
          <Pressable
            onPress={() => {
              haptic.light();
              router.replace(`/order/${order.id}`);
            }}
            style={{
              height: 56,
              borderRadius: 16,
              backgroundColor: colors.text,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: colors.bg,
                lineHeight: 18,
                includeFontPadding: false,
              }}
            >
              {t('checkout.trackOrder')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={{
              height: 48,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: colors.textMuted,
                lineHeight: 17,
                includeFontPadding: false,
              }}
            >
              {t('checkout.successContinueShopping')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryLine({
  Icon,
  label,
  value,
  valueBold,
}: {
  Icon: typeof Receipt;
  label: string;
  value: string;
  valueBold?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon size={14} color={colors.textMuted} strokeWidth={1.75} />
      <Text style={{ flex: 1, fontSize: 13, color: colors.textMuted, letterSpacing: 0 }}>{label}</Text>
      <Text
        style={{
          fontSize: valueBold ? 14 : 13,
          fontWeight: valueBold ? '700' : '600',
          color: colors.text,
          fontVariant: ['tabular-nums'],
          letterSpacing: 0,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
