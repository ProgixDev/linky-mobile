import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Input } from '../../../src/components/primitives/Input';
import { Chip } from '../../../src/components/primitives/Chip';
import { Switch } from '../../../src/components/primitives/Switch';
import { Button } from '../../../src/components/primitives/Button';
import { ProgressDots } from '../../../src/components/primitives/ProgressDots';
import { TopBar } from '../../../src/components/nav/TopBar';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { CitySelectField } from '../../../src/components/forms/CitySelectField';
import { useCreateListing } from '../../../src/stores/createListing';

const PROPERTY_TYPE_DEFS = [
  { id: 'location' as const, labelKey: 'create.typeLocation' },
  { id: 'vente' as const, labelKey: 'create.typeVente' },
  { id: 'terrain' as const, labelKey: 'create.typeTerrain' },
];

export default function CreatePropertyDetailsRoute() {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const state = useCreateListing();
  const PROPERTY_TYPES = useMemo(
    () => PROPERTY_TYPE_DEFS.map((tp) => ({ ...tp, label: t(tp.labelKey) })),
    [t],
  );
  const isTerrain = state.propertyType === 'terrain';
  // Switching to terrain clears the fields that don't apply to land, so a
  // listing that started as a flat never ships stale rooms / furnished /
  // amenities to the backend.
  const selectType = (tp: (typeof PROPERTY_TYPES)[number]['id']) => {
    state.set('propertyType', tp);
    if (tp === 'terrain') {
      state.set('rooms', 0);
      state.set('furnished', false);
      state.set('amenities', []);
    }
  };
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('create.propTopbarTitleNew')} back />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <ProgressDots total={6} current={2} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          {t('create.stepDotsWith', { current: 3, total: 6, label: t('create.stepPropDetailsLabel') })}
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 16 }}>
          {t('create.stepPropDetailsTitle')}
        </Text>

        <View style={{ gap: 12 }}>
          {/* Type — drives the whole listing (was never selectable, so every
              property published as a rental ; agents couldn't list sales or
              land at all). */}
          <View>
            <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
              {t('create.fieldTypeProp')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {PROPERTY_TYPES.map((tp) => (
                <Chip
                  key={tp.id}
                  label={tp.label}
                  active={state.propertyType === tp.id}
                  onPress={() => selectType(tp.id)}
                  block
                />
              ))}
            </View>
          </View>

          <Input
            label={t('create.fieldTitleProp2')}
            value={state.title}
            onChangeText={(txt) => state.set('title', txt)}
            placeholder={isTerrain ? t('create.fieldTitlePlaceholderTerrain') : t('create.fieldTitlePlaceholderHome')}
          />

          {/* Description — the create flow never collected one, so every new
              listing shipped with an empty description. Whole box is tappable
              (Input wraps a Pressable that focuses the multiline field). */}
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {t('create.fieldDescription')}
              </Text>
              <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                {state.description.length} / 600
              </Text>
            </View>
            <Input
              multiline
              value={state.description}
              onChangeText={(txt) => state.set('description', txt.slice(0, 600))}
              placeholder={t('create.fieldDescriptionPropPlaceholder')}
            />
          </View>

          {/* Rental billing period — only for locations. Drives per_month on
              the backend (month ⇒ true, day ⇒ false). */}
          {state.propertyType === 'location' && (
            <View>
              <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
                {t('create.fieldRentalPeriod')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Chip
                  label={t('create.rentalPeriodMonth')}
                  active={state.rentalPeriod === 'month'}
                  onPress={() => state.set('rentalPeriod', 'month')}
                  block
                />
                <Chip
                  label={t('create.rentalPeriodDay')}
                  active={state.rentalPeriod === 'day'}
                  onPress={() => state.set('rentalPeriod', 'day')}
                  block
                />
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Input
                label={
                  state.propertyType === 'location'
                    ? (state.rentalPeriod === 'day' ? t('create.fieldPriceDay') : t('create.fieldPriceMonth'))
                    : t('create.fieldPriceTotal2')
                }
                value={new Intl.NumberFormat('fr-FR').format(state.priceGnf)}
                onChangeText={(txt) => state.set('priceGnf', Number(txt.replace(/\D/g, '')) || 0)}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ width: 110 }}>
              <Input
                label={t('create.fieldAreaWithUnit')}
                value={String(state.areaSqm)}
                onChangeText={(txt) => state.set('areaSqm', Number(txt.replace(/\D/g, '')) || 0)}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <CitySelectField value={state.city} onChange={(c) => state.set('city', c)} />
            </View>
            {!isTerrain && (
              <View style={{ width: 100 }}>
                <Input
                  label={t('create.fieldRooms')}
                  value={String(state.rooms)}
                  onChangeText={(txt) => state.set('rooms', Number(txt.replace(/\D/g, '')) || 0)}
                  keyboardType="number-pad"
                />
              </View>
            )}
          </View>

          <Input label={t('create.fieldDistrict')} value={state.district} onChangeText={(txt) => state.set('district', txt)} placeholder={t('create.fieldDistrictPlaceholder')} />

          {/* Distance au goudron — plain field like the others (the amber
              « champ clé » hero box read as an error/warning; client ask
              2026-07-06). */}
          <Input
            label={t('create.fieldDistance')}
            value={String(state.distanceToRoadMeters)}
            onChangeText={(txt) => state.set('distanceToRoadMeters', Number(txt.replace(/\D/g, '')) || 0)}
            keyboardType="number-pad"
          />

          {!isTerrain && (
            <View
              style={{
                padding: 14,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600' }}>{t('create.fieldFurnished')}</Text>
                <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                  {t('create.fieldFurnishedSub')}
                </Text>
              </View>
              <Switch value={state.furnished} onChange={(v) => state.set('furnished', v)} />
            </View>
          )}
        </View>
      </ScrollView>
      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" label={t('create.back')} onPress={() => router.back()} />
        <Button
          label={t('create.continue')}
          style={{ flex: 1 }}
          disabled={!state.title.trim() || state.priceGnf <= 0 || !state.city.trim()}
          onPress={() => router.push('/create/property/location')}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
