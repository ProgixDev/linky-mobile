import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import Svg, { Rect, Line, Defs, ClipPath, Path } from 'react-native-svg';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { haptic } from '../../src/lib/haptics';
import { usePrefs } from '../../src/stores/prefs';
import { useToast } from '../../src/components/feedback/Toast';

type LangCode = 'fr' | 'en' | 'pular' | 'sousou';
type FlagKind = 'fr' | 'gb' | 'gn';

interface LangOption {
  code: LangCode;
  label: string;
  native: string;
  flag: FlagKind;
}

const LANGUAGES: LangOption[] = [
  { code: 'fr', label: 'Français', native: 'Langue par défaut', flag: 'fr' },
  { code: 'en', label: 'English', native: 'À venir', flag: 'gb' },
  { code: 'pular', label: 'Pular', native: 'À venir', flag: 'gn' },
  { code: 'sousou', label: 'Sousou', native: 'À venir', flag: 'gn' },
];

function Flag({ kind }: { kind: FlagKind }) {
  // Drawn flag stripes — universal, doesn't depend on emoji font.
  // FR: vertical blue/white/red. GN: vertical red/yellow/green. GB: simplified horizontal red/white/blue.
  if (kind === 'fr') {
    return (
      <View
        style={{
          width: 24,
          height: 16,
          borderRadius: 3,
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        <View style={{ flex: 1, backgroundColor: '#0055A4' }} />
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
        <View style={{ flex: 1, backgroundColor: '#EF4135' }} />
      </View>
    );
  }
  if (kind === 'gn') {
    return (
      <View
        style={{
          width: 24,
          height: 16,
          borderRadius: 3,
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        <View style={{ flex: 1, backgroundColor: '#CE1126' }} />
        <View style={{ flex: 1, backgroundColor: '#FCD116' }} />
        <View style={{ flex: 1, backgroundColor: '#009460' }} />
      </View>
    );
  }
  // GB — proper Union Jack drawn with SVG (clipped diagonals so red bars sit on the saltire correctly).
  return (
    <View
      style={{
        width: 24,
        height: 16,
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <Svg width={24} height={16} viewBox="0 0 60 30">
        <Defs>
          <ClipPath id="uk-saltire">
            <Path d="M30,15 L0,30 L0,30 Z M30,15 L60,30 L60,30 Z M30,15 L60,0 L60,0 Z M30,15 L0,0 L0,0 Z" />
          </ClipPath>
        </Defs>
        {/* Base */}
        <Rect width={60} height={30} fill="#012169" />
        {/* White St Andrew (saltire) */}
        <Line x1={0} y1={0} x2={60} y2={30} stroke="#FFFFFF" strokeWidth={6} />
        <Line x1={60} y1={0} x2={0} y2={30} stroke="#FFFFFF" strokeWidth={6} />
        {/* Red St Patrick (offset within saltire halves so it looks correct) */}
        <Line x1={0} y1={0} x2={60} y2={30} stroke="#C8102E" strokeWidth={2} />
        <Line x1={60} y1={0} x2={0} y2={30} stroke="#C8102E" strokeWidth={2} />
        {/* White St George (thicker) */}
        <Line x1={30} y1={0} x2={30} y2={30} stroke="#FFFFFF" strokeWidth={10} />
        <Line x1={0} y1={15} x2={60} y2={15} stroke="#FFFFFF" strokeWidth={10} />
        {/* Red St George (thinner, on top) */}
        <Line x1={30} y1={0} x2={30} y2={30} stroke="#C8102E" strokeWidth={6} />
        <Line x1={0} y1={15} x2={60} y2={15} stroke="#C8102E" strokeWidth={6} />
      </Svg>
    </View>
  );
}

export default function SettingsRoute() {
  const { colors } = useTheme();
  const { language, setLanguage } = usePrefs();
  const toast = useToast();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title="Langue"
          subtitle="L'application est disponible en français pour la V1."
        />

        <View
          style={{
            marginHorizontal: 24,
            borderRadius: 18,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {LANGUAGES.map((lang, idx) => {
            const selected = language === lang.code;
            const disabled = lang.code !== 'fr';
            return (
              <Pressable
                key={lang.code}
                // Phase Y.3 — disabled rows still tap to a small "Bientôt" toast so
                // the user gets visible feedback (otherwise the tap feels broken).
                // setLanguage is never called for non-French; the radio stays put.
                onPress={() => {
                  if (disabled) {
                    haptic.light();
                    toast.show('Bientôt disponible.', 'info');
                    return;
                  }
                  haptic.selection();
                  setLanguage(lang.code);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  borderBottomWidth: idx < LANGUAGES.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                  opacity: disabled ? 0.55 : 1,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: colors.bgSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Flag kind={lang.flag} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14.5,
                      fontWeight: '600',
                      color: colors.text,
                      letterSpacing: 0,
                      lineHeight: 18,
                      includeFontPadding: false,
                    }}
                  >
                    {lang.label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.textMuted,
                      marginTop: 2,
                      letterSpacing: 0,
                      lineHeight: 15,
                    }}
                  >
                    {lang.native}
                  </Text>
                </View>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: selected ? colors.primary : 'transparent',
                    borderWidth: selected ? 0 : 1.5,
                    borderColor: colors.borderStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
