import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Wifi,
  Car,
  Snowflake,
  ChefHat,
  Shield,
  Trees,
  Waves,
  ArrowUpDown,
  Sun,
  Zap,
  Droplet,
  Box,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';
import { useCreateListing } from '../../../src/stores/createListing';

// Phase I.9 — ids are stable backend keys ; labels resolve via i18n at render.
const AMENITY_DEFS: { id: string; labelKey: string; Icon: LucideIcon }[] = [
  { id: 'electricity', labelKey: 'create.amenityElectricity', Icon: Zap },
  { id: 'water',       labelKey: 'create.amenityWater',       Icon: Droplet },
  { id: 'ac',          labelKey: 'create.amenityClim',        Icon: Snowflake },
  { id: 'park',        labelKey: 'create.amenityParking',     Icon: Car },
  { id: 'sec',         labelKey: 'create.amenitySec',         Icon: Shield },
  { id: 'pool',        labelKey: 'create.amenityPool',        Icon: Waves },
  { id: 'garden',      labelKey: 'create.amenityGardenAlt',   Icon: Trees },
  { id: 'kitchen',     labelKey: 'create.amenityKitchen',     Icon: ChefHat },
  { id: 'wifi',        labelKey: 'create.amenityWifi',        Icon: Wifi },
  { id: 'lift',        labelKey: 'create.amenityLift',        Icon: ArrowUpDown },
  { id: 'terrace',     labelKey: 'create.amenityTerrace',     Icon: Sun },
  { id: 'cellar',      labelKey: 'create.amenityCellar',      Icon: Box },
];

export default function AmenitiesRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
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
            router.push('/create/property/photos');
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
