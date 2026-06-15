import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, View, type ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { PageDots } from '../../src/components/primitives/ProgressDots';
import { welcomeHeroes } from '../../src/data/photos';

const { width: SW, height: SH } = Dimensions.get('window');

const HERO_RATIO = 0.55;
const CURVE_HEIGHT = 36;
const AUTO_ADVANCE_MS = 4000;

export default function WelcomeRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);
  const listRef = useRef<FlatList>(null);
  const userPaused = useRef(false);

  // Phase I.3b — SLIDES used to be at module scope, which froze the strings
  // at the first language i18next resolved. Moved inside the component and
  // gated on t so swapping language re-builds the slide content.
  const SLIDES = useMemo(
    () => [
      {
        hero: welcomeHeroes.marche,
        title: t('onboarding.welcome.slide1Title'),
        sub: t('onboarding.welcome.slide1Sub'),
      },
      {
        hero: welcomeHeroes.immobilier,
        title: t('onboarding.welcome.slide2Title'),
        sub: t('onboarding.welcome.slide2Sub'),
      },
      {
        hero: welcomeHeroes.paiement,
        title: t('onboarding.welcome.slide3Title'),
        sub: t('onboarding.welcome.slide3Sub'),
      },
    ],
    [t],
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const i = viewableItems[0]?.index ?? 0;
    setIdx(i);
  }).current;

  // Auto-advance through the slides — pauses while the user is touching the carousel
  useEffect(() => {
    const t = setInterval(() => {
      if (userPaused.current) return;
      const next = (idx + 1) % SLIDES.length;
      listRef.current?.scrollToIndex({ index: next, animated: true });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [idx]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Brand logo overlay — sits on top of the hero photo, centered */}
      <SafeAreaView
        edges={['top']}
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          alignItems: 'center',
        }}
      >
        <Image
          source={require('../../assets/images/icon.png')}
          style={{ width: 64, height: 64, marginTop: 8, borderRadius: 16 }}
          contentFit="contain"
        />
      </SafeAreaView>

      {/* Swipeable area — photo + title + sub change per slide */}
      <View style={{ height: SH - 192 /* leaves room for buttons + dots overlay */ }}>
        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => {
            userPaused.current = true;
          }}
          onMomentumScrollEnd={() => {
            // Resume auto-advance a moment after user lets go
            setTimeout(() => {
              userPaused.current = false;
            }, 2000);
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item }) => (
            <View style={{ width: SW, backgroundColor: colors.bg }}>
              <View style={{ height: SH * HERO_RATIO }}>
                <Image
                  source={item.hero}
                  contentFit="cover"
                  style={{ flex: 1 }}
                  transition={200}
                />
              </View>

              {/* Cream curve that paints over the bottom of the photo */}
              <Svg
                width="100%"
                height={CURVE_HEIGHT}
                viewBox="0 0 100 36"
                preserveAspectRatio="none"
                style={{ marginTop: -CURVE_HEIGHT }}
              >
                <Path d="M0,0 Q50,36 100,0 L100,36 L0,36 Z" fill={colors.bg} />
              </Svg>

              {/* Per-slide text block */}
              <View style={{ paddingHorizontal: 28, paddingTop: 8, alignItems: 'center' }}>
                <Text
                  style={{
                    marginTop: 8,
                    textAlign: 'center',
                    fontSize: 36,
                    lineHeight: 40,
                    fontWeight: '800',
                    letterSpacing: -0.6,
                    color: colors.text,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{
                    marginTop: 14,
                    textAlign: 'center',
                    fontSize: 15,
                    lineHeight: 22,
                    color: colors.textMuted,
                  }}
                >
                  {item.sub}
                </Text>
              </View>
            </View>
          )}
        />
      </View>

      {/* Fixed bottom overlay — dots + buttons stay PUT while the user swipes */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 28,
          paddingBottom: 28,
          paddingTop: 12,
          backgroundColor: colors.bg,
        }}
      >
        <View style={{ alignItems: 'center', marginBottom: 18 }}>
          <PageDots total={SLIDES.length} current={idx} />
        </View>
        <View style={{ gap: 12 }}>
          <Button
            variant="dark"
            size="lg"
            block
            label={t('onboarding.welcome.start')}
            onPress={() => router.push('/(onboarding)/auth-choice')}
          />
          <Button
            variant="outline"
            size="lg"
            block
            label={t('onboarding.welcome.haveAccount')}
            onPress={() => router.push('/(onboarding)/auth-choice?mode=login')}
          />
        </View>
      </View>
    </View>
  );
}
