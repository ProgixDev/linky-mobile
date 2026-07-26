import { useEffect } from 'react';
import { Dimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { VideoView, useVideoPlayer } from 'expo-video';
import { router } from 'expo-router';

// Splash background must always be the cream brand color regardless of theme.
// Matches the cream baked into the splash video so there's no visible seam.
const SPLASH_BG = '#F0E0CF';

// Source video is 3840×2160 (16:9), 6s. Played centered, full width.
const SPLASH_VIDEO = require('../../assets/videos/splash.mp4');
const SW = Math.min(Dimensions.get('window').width, 500);
const VIDEO_ASPECT = 16 / 9;
const VIDEO_HEIGHT = SW / VIDEO_ASPECT;

// Hard fallback in case the playToEnd event never fires (video error / interruption).
const FALLBACK_MS = 7000;

export default function SplashRoute() {
  const player = useVideoPlayer(SPLASH_VIDEO, (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      router.replace('/(onboarding)/welcome');
    });
    const t = setTimeout(() => router.replace('/(onboarding)/welcome'), FALLBACK_MS);
    return () => {
      sub.remove();
      clearTimeout(t);
    };
  }, [player]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: SPLASH_BG,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <StatusBar style="dark" backgroundColor={SPLASH_BG} />
      <VideoView
        player={player}
        style={{ width: SW, height: VIDEO_HEIGHT, backgroundColor: SPLASH_BG }}
        contentFit="contain"
        nativeControls={false}
      />
    </View>
  );
}
