import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { ProgressDots } from '../../../src/components/primitives/ProgressDots';
import { TopBar } from '../../../src/components/nav/TopBar';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { I, type IconKey } from '../../../src/icons/Icon';
import { useCreateListing } from '../../../src/stores/createListing';

type Tint = 'primary' | 'accent' | 'cream' | 'info';

// Phase I.9 — `code` stays stable (it's stored on the product server-side) ;
// `labelKey` resolves to the displayed name at render so the tile labels
// flip with the active language. Matching by code keeps filters consistent
// across language changes.
const CATEGORY_DEFS: { code: string; labelKey: string; icon: IconKey; tint: Tint }[] = [
  { code: 'Électronique', labelKey: 'create.catElectronique', icon: 'zap', tint: 'accent' },
  { code: 'Téléphonie', labelKey: 'create.catTelephonie', icon: 'phone', tint: 'primary' },
  { code: 'Informatique', labelKey: 'create.catInformatique', icon: 'layers', tint: 'info' },
  { code: 'Alimentation', labelKey: 'create.catAlimentation', icon: 'store', tint: 'cream' },
  { code: 'Maison & Déco', labelKey: 'create.catMaisonDeco', icon: 'sofa', tint: 'primary' },
  { code: 'Vêtements & Mode', labelKey: 'create.catVetementsMode', icon: 'shirt', tint: 'accent' },
  { code: 'Sport & Loisirs', labelKey: 'create.catSportLoisirs', icon: 'trend', tint: 'info' },
  { code: 'Beauté & Santé', labelKey: 'create.catBeauteSante', icon: 'drop', tint: 'primary' },
  { code: 'Auto & Moto', labelKey: 'create.catAutoMoto', icon: 'car', tint: 'cream' },
  { code: 'Autres', labelKey: 'create.catAutres', icon: 'package', tint: 'accent' },
];

export default function CreateCategoryRoute() {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const category = useCreateListing((s) => s.category);
  const setVal = useCreateListing((s) => s.set);
  const CATEGORIES = useMemo(
    () => CATEGORY_DEFS.map((c) => ({ ...c, label: t(c.labelKey) })),
    [t],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('create.topbarTitle')} back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        <ProgressDots total={6} current={1} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          {t('create.stepDotsWith', { current: 2, total: 6, label: t('create.stepCategoryLabel') })}
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 18 }}>
          {t('create.stepCategoryTitle')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CATEGORIES.map((cat) => {
            const sel = cat.code === category;
            const Icon = I[cat.icon];
            const palette = {
              primary: { bg: colors.primarySoft, fg: colors.primary },
              accent: { bg: colors.accentSoft, fg: colors.accentText },
              cream: { bg: colors.bgSunken, fg: colors.text },
              info: { bg: 'rgba(58,124,168,0.12)', fg: colors.info },
            }[cat.tint];
            return (
              <Pressable
                key={cat.code}
                onPress={() => setVal('category', cat.code)}
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
                <Text style={{ fontSize: 13, fontWeight: '600' }}>{cat.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <StickyBottom>
        <Button size="lg" block label={t('create.continue')} disabled={!category} onPress={() => router.push('/create/product/details')} />
      </StickyBottom>
    </SafeAreaView>
  );
}
