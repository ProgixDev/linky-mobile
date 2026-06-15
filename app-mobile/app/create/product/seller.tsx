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

interface OptionDef {
  id: 'particular' | 'merchant';
  title: string;
  desc: string;
  icon: IconKey;
}

const OPTION_DEFS: { id: 'particular' | 'merchant'; titleKey: string; descKey: string; icon: IconKey }[] = [
  { id: 'particular', titleKey: 'create.sellerPart', descKey: 'create.sellerPartDesc', icon: 'user' },
  { id: 'merchant', titleKey: 'create.sellerMerchant', descKey: 'create.sellerMerchantDesc', icon: 'store' },
];

export default function CreateProductSeller() {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const sellerType = useCreateListing((s) => s.sellerType);
  const setVal = useCreateListing((s) => s.set);
  const OPTIONS: OptionDef[] = useMemo(
    () => OPTION_DEFS.map((o) => ({ id: o.id, title: t(o.titleKey), desc: t(o.descKey), icon: o.icon })),
    [t],
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('create.topbarTitle')} back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        <ProgressDots total={6} current={0} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          {t('create.stepDots', { current: 1, total: 6 })}
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 18 }}>
          {t('create.stepSeller')}
        </Text>
        {OPTIONS.map((o) => {
          const sel = sellerType === o.id;
          const Icon = I[o.icon];
          return (
            <Pressable key={o.id} onPress={() => setVal('sellerType', o.id)}>
              <View
                style={{
                  padding: 16,
                  borderRadius: radii.lg,
                  borderWidth: sel ? 2 : 1,
                  borderColor: sel ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                  marginBottom: 10,
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: sel ? colors.primarySoft : colors.bgSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={20} color={sel ? colors.primary : colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="titleM" style={{ fontSize: 14 }}>
                    {o.title}
                  </Text>
                  <Text variant="micro" tone="muted" style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}>
                    {o.desc}
                  </Text>
                </View>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: sel ? colors.primary : 'transparent',
                    borderWidth: sel ? 0 : 1.5,
                    borderColor: colors.borderStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {sel && <I.check size={13} color="#FFFFFF" stroke={3} />}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      <StickyBottom>
        <Button size="lg" block label={t('create.continue')} onPress={() => router.push('/create/product/category')} />
      </StickyBottom>
    </SafeAreaView>
  );
}
