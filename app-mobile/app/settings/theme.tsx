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

// Fixed palettes for the PREVIEWS (each card shows the app in that theme, so the
// swatch stays true no matter the app's current theme). Not from useTheme.
interface Palette {
  bg: string;
  card: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentText: string;
  border: string;
}
const LIGHT: Palette = {
  bg: '#F4EFE7', card: '#FFFFFF', text: '#0E1311', muted: '#A9A294',
  faint: '#ECE6DA', accent: '#0F7256', accentText: '#FFFFFF', border: '#E7E0D2',
};
const DARK: Palette = {
  bg: '#0E1311', card: '#1A2220', text: '#F4F6F5', muted: '#7E8B86',
  faint: '#242E2A', accent: '#5FE3B4', accentText: '#08110D', border: '#2A332F',
};

interface ThemeOption {
  id: ThemePreference;
  label: string;
  sub: string;
  Icon: LucideIcon;
}

// A tiny, realistic Linky screen in the given palette — header (avatar + title +
// theme icon), a listing card, and a CTA pill. A true glimpse of the theme
// rather than abstract bars. `compact` drops the listing card (used for the two
// halves of the split « System » preview).
function ThemePreview({ p, Icon, compact = false }: { p: Palette; Icon: LucideIcon; compact?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, padding: compact ? 11 : 14, gap: compact ? 9 : 10, justifyContent: 'center' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{ width: compact ? 18 : 22, height: compact ? 18 : 22, borderRadius: 999, backgroundColor: p.accent }} />
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ width: '58%', height: compact ? 6 : 7, borderRadius: 4, backgroundColor: p.text, opacity: 0.9 }} />
          {!compact && <View style={{ width: '34%', height: 5, borderRadius: 3, backgroundColor: p.muted }} />}
        </View>
        <View
          style={{
            width: compact ? 26 : 34,
            height: compact ? 26 : 34,
            borderRadius: compact ? 8 : 10,
            backgroundColor: p.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={compact ? 13 : 17} color={p.accentText} strokeWidth={2.25} />
        </View>
      </View>

      {/* Listing card */}
      {!compact && (
        <View
          style={{
            flexDirection: 'row',
            gap: 9,
            backgroundColor: p.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: p.border,
            padding: 8,
            alignItems: 'center',
          }}
        >
          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: p.faint }} />
          <View style={{ flex: 1, gap: 5 }}>
            <View style={{ width: '72%', height: 6, borderRadius: 3, backgroundColor: p.text, opacity: 0.85 }} />
            <View style={{ width: '46%', height: 5, borderRadius: 3, backgroundColor: p.muted }} />
          </View>
        </View>
      )}

      {/* CTA pill */}
      <View style={{ height: compact ? 13 : 16, borderRadius: 999, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: '30%', height: 4, borderRadius: 3, backgroundColor: p.accentText, opacity: 0.85 }} />
      </View>
    </View>
  );
}

export default function ThemeSettingsRoute() {
  const { colors, preference, setPreference } = useTheme();
  const { t } = useTranslation();

  // Memo on t so labels re-resolve when the language changes.
  const OPTIONS: ThemeOption[] = useMemo(
    () => [
      { id: 'system', label: t('settings.theme.systemLabel'), sub: t('settings.theme.systemSub'), Icon: Smartphone },
      { id: 'light', label: t('settings.theme.lightLabel'), sub: t('settings.theme.lightSub'), Icon: Sun },
      { id: 'dark', label: t('settings.theme.darkLabel'), sub: t('settings.theme.darkSub'), Icon: Moon },
    ],
    [t],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title={t('settings.theme.title')} subtitle={t('settings.theme.subtitle')} />

        <View style={{ paddingHorizontal: 20, gap: 14 }}>
          {OPTIONS.map((o) => {
            const selected = preference === o.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => {
                  haptic.selection();
                  setPreference(o.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${o.label}. ${o.sub}`}
                style={[
                  {
                    borderRadius: 22,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: colors.card,
                    overflow: 'hidden',
                  },
                  selected && {
                    shadowColor: colors.primary,
                    shadowOpacity: 0.18,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 6,
                  },
                ]}
              >
                {/* Preview */}
                <View style={{ height: 138 }}>
                  {o.id === 'system' ? (
                    // Split light | dark — conveys "adapts to your device" and
                    // sets System apart from the plain Light card.
                    <View style={{ flex: 1, flexDirection: 'row' }}>
                      <View style={{ flex: 1 }}>
                        <ThemePreview p={LIGHT} Icon={Sun} compact />
                      </View>
                      <View style={{ width: 1, backgroundColor: '#00000018' }} />
                      <View style={{ flex: 1 }}>
                        <ThemePreview p={DARK} Icon={Moon} compact />
                      </View>
                    </View>
                  ) : (
                    <ThemePreview p={o.id === 'dark' ? DARK : LIGHT} Icon={o.Icon} />
                  )}
                </View>

                {/* Label row */}
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 15,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    backgroundColor: colors.card,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 15.5,
                        fontWeight: '700',
                        color: colors.text,
                        letterSpacing: -0.1,
                        lineHeight: 19,
                        includeFontPadding: false,
                      }}
                    >
                      {o.label}
                    </Text>
                    <Text
                      style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 3, letterSpacing: 0, lineHeight: 16 }}
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
