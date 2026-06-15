// Agent edits an existing property. Reachable from the boutique/estate dashboard
// manage sheet. Mirrors the create-details fields (type, title, price, area,
// rooms, city, district, distance-to-road, furnished) + an editable description
// the create flow never collected. Photos are out of scope here. Wired to
// useUpdateProperty -> /property-update.
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Input } from '../../../src/components/primitives/Input';
import { Chip } from '../../../src/components/primitives/Chip';
import { Switch } from '../../../src/components/primitives/Switch';
import { Button } from '../../../src/components/primitives/Button';
import { TopBar } from '../../../src/components/nav/TopBar';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
import { ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { CitySelectField } from '../../../src/components/forms/CitySelectField';
import { I } from '../../../src/icons/Icon';
import { useProperty, useUpdateProperty } from '../../../src/data/queries';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';

type PType = 'location' | 'vente' | 'terrain';
// Phase I.3j — stable backend ids ; the visible label is resolved at render
// time via t() so the chip strip flips with the active language.
const PROPERTY_TYPE_DEFS: { id: PType; labelKey: string }[] = [
  { id: 'location', labelKey: 'propertyEdit.typeLocation' },
  { id: 'vente', labelKey: 'propertyEdit.typeVente' },
  { id: 'terrain', labelKey: 'propertyEdit.typeTerrain' },
];

export default function PropertyEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const PROPERTY_TYPES = useMemo(
    () => PROPERTY_TYPE_DEFS.map((d) => ({ id: d.id, label: t(d.labelKey) })),
    [t],
  );
  const propertyQuery = useProperty(id);
  const update = useUpdateProperty();
  const prop = propertyQuery.data;

  const [type, setType] = useState<PType>('location');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [area, setArea] = useState(0);
  const [rooms, setRooms] = useState(0);
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [distance, setDistance] = useState(0);
  const [furnished, setFurnished] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  if (prop && !hydrated) {
    setType(prop.type as PType);
    setTitle(prop.title);
    setDescription(prop.description);
    setPrice(prop.priceGnf);
    setArea(prop.areaSqm ?? 0);
    setRooms(prop.bedrooms ?? 0);
    setCity(prop.city);
    setDistrict(prop.district);
    setDistance(prop.distanceToRoadMeters);
    setFurnished(prop.furnished ?? false);
    setHydrated(true);
  }

  const isTerrain = type === 'terrain';
  const selectType = (tp: PType) => {
    setType(tp);
    if (tp === 'terrain') {
      setRooms(0);
      setFurnished(false);
    }
  };

  const dirty =
    hydrated &&
    !!prop &&
    (type !== prop.type ||
      title.trim() !== prop.title ||
      description.trim() !== prop.description ||
      price !== prop.priceGnf ||
      area !== (prop.areaSqm ?? 0) ||
      rooms !== (prop.bedrooms ?? 0) ||
      city.trim() !== prop.city ||
      district.trim() !== prop.district ||
      distance !== prop.distanceToRoadMeters ||
      furnished !== (prop.furnished ?? false));
  const canSave = dirty && !!title.trim() && price > 0 && !!city.trim();

  async function onSave() {
    if (!canSave || update.isPending || !prop) return;
    try {
      await update.mutateAsync({
        id: prop.id,
        type,
        title: title.trim(),
        description: description.trim(),
        price_minor: price,
        area_sqm: area || null,
        bedrooms: isTerrain ? null : rooms || null,
        furnished: isTerrain ? null : furnished,
        city: city.trim(),
        district: district.trim() || null,
        distance_to_road_m: distance,
      });
      toast.show(t('propertyEdit.successToast'), 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/boutique');
    } catch (e) {
      toast.show(toToastMessage(e, t('propertyEdit.errorToast')), 'danger');
    }
  }

  if (propertyQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('propertyEdit.topbar')} back />
        <View style={{ padding: 16, gap: 14 }}>
          <Skeleton height={44} radius={12} />
          <Skeleton height={56} radius={12} />
          <Skeleton height={120} radius={12} />
        </View>
      </SafeAreaView>
    );
  }
  if (propertyQuery.isError || !prop) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('propertyEdit.topbar')} back />
        <ErrorStateView onRetry={() => void propertyQuery.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('propertyEdit.topbar')} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
          <View style={{ gap: 12, marginTop: 12 }}>
            <View>
              <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
                {t('propertyEdit.typeLabel')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {PROPERTY_TYPES.map((tp) => (
                  <Chip key={tp.id} label={tp.label} active={type === tp.id} onPress={() => selectType(tp.id)} block />
                ))}
              </View>
            </View>

            <Input label={t('propertyEdit.titleLabel')} value={title} onChangeText={setTitle} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Input
                  label={type === 'location' ? t('propertyEdit.pricePerMonth') : t('propertyEdit.priceLabel')}
                  value={new Intl.NumberFormat('fr-FR').format(price)}
                  onChangeText={(txt) => setPrice(Number(txt.replace(/\D/g, '')) || 0)}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ width: 110 }}>
                <Input
                  label={t('propertyEdit.areaLabel')}
                  value={String(area)}
                  onChangeText={(txt) => setArea(Number(txt.replace(/\D/g, '')) || 0)}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <CitySelectField value={city} onChange={setCity} />
              </View>
              {!isTerrain && (
                <View style={{ width: 100 }}>
                  <Input
                    label={t('propertyEdit.roomsLabel')}
                    value={String(rooms)}
                    onChangeText={(txt) => setRooms(Number(txt.replace(/\D/g, '')) || 0)}
                    keyboardType="number-pad"
                  />
                </View>
              )}
            </View>

            <Input label={t('propertyEdit.districtLabel')} value={district} onChangeText={setDistrict} placeholder={t('propertyEdit.districtPlaceholder')} />

            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {t('propertyEdit.descriptionLabel')}
                </Text>
                <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                  {description.length} / 600
                </Text>
              </View>
              <Input multiline value={description} onChangeText={(txt) => setDescription(txt.slice(0, 600))} />
            </View>

            <View
              style={{
                padding: 16,
                borderRadius: radii.lg,
                backgroundColor: colors.accentSoft,
                borderWidth: 1.5,
                borderColor: colors.accent,
              }}
            >
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                <I.road size={14} color={colors.accentText} />
                <Text style={{ fontSize: 11, color: colors.accentText, fontWeight: '700', letterSpacing: 0.4 }}>
                  {t('propertyEdit.distanceLabel')}
                </Text>
              </View>
              <Input
                value={String(distance)}
                onChangeText={(txt) => setDistance(Number(txt.replace(/\D/g, '')) || 0)}
                keyboardType="number-pad"
              />
            </View>

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
                  <Text style={{ fontSize: 13, fontWeight: '600' }}>{t('propertyEdit.furnishedLabel')}</Text>
                  <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                    {t('propertyEdit.furnishedSub')}
                  </Text>
                </View>
                <Switch value={furnished} onChange={setFurnished} />
              </View>
            )}
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
          <Button variant="dark" size="lg" block label={t('propertyEdit.save')} onPress={onSave} loading={update.isPending} disabled={!canSave} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
