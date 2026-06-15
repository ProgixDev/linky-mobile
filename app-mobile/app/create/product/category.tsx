import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { ProgressDots } from '../../../src/components/primitives/ProgressDots';
import { TopBar } from '../../../src/components/nav/TopBar';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { I, type IconKey } from '../../../src/icons/Icon';
import { useCreateListing } from '../../../src/stores/createListing';

type Tint = 'primary' | 'accent' | 'cream' | 'info';

const CATEGORIES: { t: string; icon: IconKey; tint: Tint }[] = [
  { t: 'Mode & Beauté', icon: 'shirt', tint: 'primary' },
  { t: 'Électronique', icon: 'phone', tint: 'accent' },
  { t: 'Maison', icon: 'sofa', tint: 'cream' },
  { t: 'Auto & Moto', icon: 'car', tint: 'info' },
  { t: 'Beauté & Soin', icon: 'drop', tint: 'primary' },
  { t: 'Services', icon: 'zap', tint: 'accent' },
];

export default function CreateCategoryRoute() {
  const { colors, radii } = useTheme();
  const category = useCreateListing((s) => s.category);
  const setVal = useCreateListing((s) => s.set);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Créer une annonce" back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        <ProgressDots total={6} current={1} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          Étape 2 / 6 · Catégorie
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 18 }}>
          Quelle catégorie ?
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CATEGORIES.map((cat) => {
            const sel = cat.t === category;
            const Icon = I[cat.icon];
            const palette = {
              primary: { bg: colors.primarySoft, fg: colors.primary },
              accent: { bg: colors.accentSoft, fg: colors.accentText },
              cream: { bg: colors.bgSunken, fg: colors.text },
              info: { bg: 'rgba(58,124,168,0.12)', fg: colors.info },
            }[cat.tint];
            return (
              <Pressable
                key={cat.t}
                onPress={() => setVal('category', cat.t)}
                style={{
                  flexBasis: '47%',
                  flexGrow: 1,
                  padding: 14,
                  borderRadius: radii.lg,
                  borderWidth: sel ? 2 : 1,
                  borderColor: sel ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: palette.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Icon size={18} color={palette.fg} />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600' }}>{cat.t}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <StickyBottom>
        <Button size="lg" block label="Continuer" disabled={!category} onPress={() => router.push('/create/product/details')} />
      </StickyBottom>
    </SafeAreaView>
  );
}
