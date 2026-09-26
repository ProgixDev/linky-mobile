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
import { propertyStep } from '../../../src/lib/createSteps';

// Première étape du tunnel IMMOBILIER — le pendant exact de
// create/product/seller.tsx côté article. Demande du client, 2026-09-26 :
// « Faire de même pour la partie Immo (Propriétaire / Agence Immo) avant
// d'aller sur la page de détails annonce. »
//
// CE QUE LE CHOIX CHANGE VRAIMENT. Il porte le NOM du profil créé à la première
// publication. Jusqu'ici, quiconque publiait un bien se retrouvait sous « Mon
// agence » ou « Agence de <prénom> » — y compris le particulier qui met son
// appartement en location une fois dans sa vie, et qui se voyait soudain
// présenté aux locataires comme une agence. Le choix n'a d'effet qu'à la
// PREMIÈRE publication, puisqu'ensuite le profil existe déjà et se renomme
// depuis son écran.

const OPTION_DEFS: { id: 'owner' | 'agency'; titleKey: string; descKey: string; icon: IconKey }[] = [
  { id: 'owner', titleKey: 'create.ownerPrivate', descKey: 'create.ownerPrivateDesc', icon: 'user' },
  { id: 'agency', titleKey: 'create.ownerAgency', descKey: 'create.ownerAgencyDesc', icon: 'building' },
];

export default function CreatePropertyOwner() {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const ownerType = useCreateListing((s) => s.ownerType);
  const propertyType = useCreateListing((s) => s.propertyType);
  const setVal = useCreateListing((s) => s.set);
  const step = propertyStep('owner', propertyType);

  const OPTIONS = useMemo(
    () => OPTION_DEFS.map((o) => ({ id: o.id, title: t(o.titleKey), desc: t(o.descKey), icon: o.icon })),
    [t],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('create.topbarTitle')} back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        <ProgressDots total={step.total} current={step.index} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          {t('create.stepDots', { current: step.number, total: step.total })}
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 18 }}>
          {t('create.stepOwner')}
        </Text>
        {OPTIONS.map((o) => {
          const sel = ownerType === o.id;
          const Icon = I[o.icon];
          return (
            <Pressable
              key={o.id}
              onPress={() => setVal('ownerType', o.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`${o.title}. ${o.desc}`}
            >
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
                  <Text
                    variant="micro"
                    tone="muted"
                    style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}
                  >
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
        <Button
          size="lg"
          block
          label={t('create.continue')}
          onPress={() => router.push('/create/property/details')}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
