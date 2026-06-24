import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ScrollView,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/shared/lib/cn';
import { AppText, LinkyMark } from '@/shared/ui';

import { useWelcomeStore } from '../model/welcome-store';
import { MapBackdrop } from './map-backdrop';
import { SwipeToStart } from './swipe-to-start';

const SLIDES = [
  {
    id: 'recois',
    title: 'Reçois tes livraisons',
    subtitle: 'Tes courses arrivent, prêtes à livrer.',
  },
  {
    id: 'carte',
    title: 'Trouve le client sur la carte',
    subtitle: 'Localisation exacte, en temps réel.',
  },
  {
    id: 'scanne',
    title: 'Scanne & sois payé',
    subtitle: 'Un scan du QR, la livraison est validée.',
  },
];

/**
 * Get-started — the branded launch screen (shown once per install): a map-textured
 * green backdrop with a brand watermark, a swipeable value carousel with dots, and a
 * swipe-to-start control → marks the welcome seen and hands off to OTP sign-in.
 * Entrance motion respects reduced-motion (then a plain fade). French, « tu », warm.
 */
export function GetStartedScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const markSeen = useWelcomeStore((s) => s.markSeen);
  const [index, setIndex] = useState(0);

  const reduced = useReducedMotion();
  const intro = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    intro.value = reduced ? 1 : withDelay(120, withTiming(1, { duration: 520 }));
  }, [reduced, intro]);

  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: intro.value }));
  const blockStyle = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [{ translateY: (1 - intro.value) * 18 }],
  }));

  const onStart = async () => {
    await markSeen();
    router.replace('/sign-in');
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View
      testID="get-started-screen"
      className="flex-1 bg-brand-600"
      style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}
    >
      <MapBackdrop />

      <Animated.View style={wordmarkStyle} className="flex-row items-center gap-2 px-6 pt-2">
        <LinkyMark size={34} />
        <AppText variant="label" className="text-ink-inverse">
          Linky Driver
        </AppText>
      </Animated.View>

      {/* Hero space — the backdrop watermark reads through here. */}
      <View className="flex-1" />

      <Animated.View style={blockStyle} className="gap-5 pb-2">
        <ScrollView
          testID="getstarted-carousel"
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          style={{ width }}
        >
          {SLIDES.map((s) => (
            <View key={s.id} className="justify-end gap-2 px-6" style={{ width }}>
              <AppText variant="display" className="text-ink-inverse">
                {s.title}
              </AppText>
              <AppText variant="body" className="text-ink-inverse/80">
                {s.subtitle}
              </AppText>
            </View>
          ))}
        </ScrollView>

        <View testID="getstarted-dots" className="flex-row gap-1.5 px-6">
          {SLIDES.map((s, i) => (
            <View
              key={s.id}
              className={cn(
                'h-1.5 rounded-full',
                i === index ? 'w-5 bg-accent' : 'w-1.5 bg-ink-inverse/30',
              )}
            />
          ))}
        </View>

        <View className="px-6">
          <SwipeToStart onComplete={() => void onStart()} />
        </View>
      </Animated.View>
    </View>
  );
}
