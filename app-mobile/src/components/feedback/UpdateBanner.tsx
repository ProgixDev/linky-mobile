import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { useAppUpdate } from '../../lib/appUpdate';
import { haptic } from '../../lib/haptics';

/**
 * Shown once a new version has finished downloading in the background.
 *
 * Testers used to have to force-stop and reopen the app TWICE to pick up a fix
 * (expo-updates applies a downloaded bundle only on the next launch), so they
 * kept testing stale code. Tapping here restarts the app once, immediately.
 *
 * Non-blocking by design: it sits above the tab bar and is ignorable — the
 * update also applies on its own at the next cold start.
 */
export function UpdateBanner() {
  const { ready, applying, apply } = useAppUpdate();
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!ready) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        // Clear of the tab bar AND the Android nav bar.
        bottom: 90 + insets.bottom,
      }}
    >
      <Pressable
        onPress={() => {
          haptic.light();
          void apply();
        }}
        disabled={applying}
        accessibilityRole="button"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: radii.lg,
          backgroundColor: colors.primaryDeep,
        }}
      >
        <Download size={16} color="#FFFFFF" strokeWidth={2} />
        <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 13.5, fontWeight: '600', letterSpacing: 0 }}>
          {t('update.ready')}
        </Text>
        {applying ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', letterSpacing: 0 }}>
            {t('update.cta')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
