import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Sun, Moon, Smartphone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemePreference } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { haptic } from '../../src/lib/haptics';

interface ThemeOption {
  id: ThemePreference;
  label: string;
  sub: string;
  Icon: LucideIcon;
  bg: string;
  card: string;
  text: string;
  accent: string;
  border: string;
}

export default function ThemeSettingsRoute() {
  const { colors, preference, setPreference } = useTheme();
  const { t } = useTranslation();

  // Phase I.3g — OPTIONS were module-scope, freezing labels at first
  // language resolution. Memo inside the component on t.
  const OPTIONS: ThemeOption[] = useMemo(
    () => [
      {
        id: 'system',
        label: t('settings.theme.systemLabel'),
        sub: t('settings.theme.systemSub'),
        Icon: Smartphone,
        bg: '#F7F3EC',
        card: '#FFFFFF',
        text: '#0E1311',
        accent: '#0F7256',
        border: '#E5DDC9',
      },
      {
        id: 'light',
        label: t('settings.theme.lightLabel'),
        sub: t('settings.theme.lightSub'),
        Icon: Sun,
        bg: '#F7F3EC',
        card: '#FFFFFF',
        text: '#0E1311',
        accent: '#0F7256',
        border: '#E5DDC9',
      },
      {
        id: 'dark',
        label: t('settings.theme.darkLabel'),
        sub: t('settings.theme.darkSub'),
        Icon: Moon,
        bg: '#0E1311',
        card: '#1A2220',
        text: '#FFFFFF',
        accent: '#5FE3B4',
        border: '#2A332F',
      },
    ],
    [t],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title={t('settings.theme.title')}
          subtitle={t('settings.theme.subtitle')}
        />

        <View style={{ paddingHorizontal: 24, gap: 12 }}>
          {OPTIONS.map((o) => {
            const selected = preference === o.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => {
                  haptic.selection();
                  setPreference(o.id);
                }}
                style={{
                  borderRadius: 20,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                  overflow: 'hidden',
                }}
              >
                {/* Preview */}
                <View
                  style={{
                    height: 100,
                    backgroundColor: o.bg,
                    paddingHorizontal: 16,
                    paddingTop: 14,
                    flexDirection: 'row',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  {/* Mini cards */}
                  <View
                    style={{
                      flex: 1,
                      height: 70,
                      borderRadius: 12,
                      backgroundColor: o.card,
                      borderWidth: 1,
                      borderColor: o.border,
                      padding: 8,
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        width: '60%',
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: o.text,
                        opacity: 0.9,
                      }}
                    />
                    <View
                      style={{
                        width: '40%',
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: o.text,
                        opacity: 0.3,
                      }}
                    />
                    <View style={{ flex: 1 }} />
                    <View
                      style={{
                        height: 14,
                        borderRadius: 999,
                        backgroundColor: o.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  </View>
                  <View
                    style={{
                      width: 50,
                      height: 70,
                      borderRadius: 12,
                      backgroundColor: o.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <o.Icon
                      size={20}
                      color={o.id === 'dark' ? '#0E1311' : '#FFFFFF'}
                      strokeWidth={2}
                    />
                  </View>
                </View>

                {/* Label row */}
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: colors.card,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: colors.text,
                        letterSpacing: 0,
                        lineHeight: 18,
                        includeFontPadding: false,
                      }}
                    >
                      {o.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12.5,
                        color: colors.textMuted,
                        marginTop: 2,
                        letterSpacing: 0,
                        lineHeight: 16,
                      }}
                    >
                      {o.sub}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: selected ? colors.primary : 'transparent',
                      borderWidth: selected ? 0 : 1.5,
                      borderColor: colors.borderStrong,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
