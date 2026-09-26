import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';
import { useCreateListing } from '../../../src/stores/createListing';
import { propertyStep } from '../../../src/lib/createSteps';
import { ProgressDots } from '../../../src/components/primitives/ProgressDots';
import { AMENITY_DEFS } from '../../../src/lib/amenities';

// Phase I.9 — ids are stable backend keys ; labels resolve via i18n at render.

export default function AmenitiesRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const propertyType = useCreateListing((s) => s.propertyType);
  const step = propertyStep('amenities', propertyType);
  const amenities = useCreateListing((s) => s.amenities);
  const setVal = useCreateListing((s) => s.set);
  const picked = new Set(amenities);
  const AMENITIES = useMemo(
    () => AMENITY_DEFS.map((a) => ({ ...a, label: t(a.labelKey) })),
    [t],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <ScreenHeader
          title={t('create.stepAmenitiesLabel')}
          subtitle={t('create.stepAmenitiesSubtitle')}
        />

        <View style={{ paddingHorizontal: 24, marginBottom: 14 }}>
          <ProgressDots total={step.total} current={step.index} />
          <Text variant="micro" tone="muted" style={{ marginTop: 10 }}>
            {t('create.stepDotsWith', { current: step.number, total: step.total, label: t('create.stepAmenitiesLabel') })}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 24,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {AMENITIES.map((a) => {
            const on = picked.has(a.id);
            return (
              <Pressable
                key={a.id}
                onPress={() => {
                  haptic.selection();
                  const next = new Set(amenities);
                  if (next.has(a.id)) next.delete(a.id);
                  else next.add(a.id);
                  setVal('amenities', Array.from(next));
                }}
                style={{
                  flexBasis: '47%',
                  flexGrow: 1,
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: on ? colors.primarySoft : colors.card,
                  borderWidth: on ? 1.5 : 1,
                  borderColor: on ? colors.primary : colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: on ? colors.bg : colors.bgSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <a.Icon
                    size={16}
                    color={on ? colors.primary : colors.text}
                    strokeWidth={1.75}
                  />
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: '600',
                    color: on ? colors.primaryDeep : colors.text,
                    letterSpacing: 0,
                    lineHeight: 16,
                    includeFontPadding: false,
                  }}
                  numberOfLines={2}
                >
                  {a.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <SafeAreaView
        edges={['bottom']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 8,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          onPress={() => {
            haptic.medium();
            router.push('/create/property/location');
          }}
          style={{
            height: 56,
            borderRadius: 16,
            backgroundColor: colors.text,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: colors.bg,
              lineHeight: 18,
              includeFontPadding: false,
            }}
          >
            {t('create.amenityContinue', { count: picked.size })}
          </Text>
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}
