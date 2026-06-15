// Seller edits an existing product. Reachable from the boutique dashboard's
// manage sheet. Covers every product field except photos (photo swap/reorder is
// a separate flow). Wired to useUpdateProduct -> /product-update.
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Input } from '../../../src/components/primitives/Input';
import { Chip } from '../../../src/components/primitives/Chip';
import { Button } from '../../../src/components/primitives/Button';
import { TopBar } from '../../../src/components/nav/TopBar';
import { Skeleton } from '../../../src/components/primitives/Skeleton';
import { ErrorStateView } from '../../../src/components/feedback/EmptyState';
import { CitySelectField } from '../../../src/components/forms/CitySelectField';
import { useProduct, useUpdateProduct } from '../../../src/data/queries';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { gnfToEur } from '../../../src/lib/currency';

const CONDITIONS = ['neuf', 'occasion', 'reconditionné'] as const;
// Phase I.3j — stable backend ids ; the visible label is resolved at render
// time via t() so the chip strip flips with the active language.
const CONDITION_LABEL_KEY: Record<(typeof CONDITIONS)[number], string> = {
  neuf: 'productEdit.condNeuf',
  occasion: 'productEdit.condOccasion',
  reconditionné: 'productEdit.condReconditionne',
};

export default function ProductEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const conditionLabel = useMemo(
    () => Object.fromEntries(
      CONDITIONS.map((c) => [c, t(CONDITION_LABEL_KEY[c])]),
    ) as Record<(typeof CONDITIONS)[number], string>,
    [t],
  );
  const productQuery = useProduct(id);
  const update = useUpdateProduct();
  const product = productQuery.data;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>('occasion');
  const [city, setCity] = useState('');
  const [hydrated, setHydrated] = useState(false);

  if (product && !hydrated) {
    setTitle(product.title);
    setDescription(product.description);
    setPrice(product.priceGnf);
    setCondition(product.condition as (typeof CONDITIONS)[number]);
    setCity(product.city ?? '');
    setHydrated(true);
  }

  const dirty =
    hydrated &&
    !!product &&
    (title.trim() !== product.title ||
      description.trim() !== product.description ||
      price !== product.priceGnf ||
      condition !== product.condition ||
      city.trim() !== (product.city ?? ''));
  const canSave = dirty && !!title.trim() && price > 0 && !!city.trim();

  async function onSave() {
    if (!canSave || update.isPending || !product) return;
    try {
      await update.mutateAsync({
        id: product.id,
        title: title.trim(),
        description: description.trim(),
        price_minor: price,
        condition,
        city: city.trim(),
      });
      toast.show(t('productEdit.successToast'), 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/boutique');
    } catch (e) {
      toast.show(toToastMessage(e, t('productEdit.errorToast')), 'danger');
    }
  }

  if (productQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('productEdit.topbar')} back />
        <View style={{ padding: 16, gap: 14 }}>
          <Skeleton height={56} radius={12} />
          <Skeleton height={120} radius={12} />
          <Skeleton height={56} radius={12} />
        </View>
      </SafeAreaView>
    );
  }
  if (productQuery.isError || !product) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('productEdit.topbar')} back />
        <ErrorStateView onRetry={() => void productQuery.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('productEdit.topbar')} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
          <View style={{ gap: 12, marginTop: 12 }}>
            <Input label={t('productEdit.titleLabel')} value={title} onChangeText={setTitle} />

            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {t('productEdit.descriptionLabel')}
                </Text>
                <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                  {description.length} / 600
                </Text>
              </View>
              <Input multiline value={description} onChangeText={(txt) => setDescription(txt.slice(0, 600))} />
            </View>

            <Input
              label={t('productEdit.priceLabel')}
              value={new Intl.NumberFormat('fr-FR').format(price)}
              onChangeText={(txt) => setPrice(Number(txt.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              helperText={`≈ ${gnfToEur(price)} €`}
            />

            <View>
              <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
                {t('productEdit.conditionLabel')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {CONDITIONS.map((c) => (
                  <Chip key={c} label={conditionLabel[c]} active={condition === c} onPress={() => setCondition(c)} block />
                ))}
              </View>
            </View>

            <CitySelectField value={city} onChange={setCity} />
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
          <Button variant="dark" size="lg" block label={t('productEdit.save')} onPress={onSave} loading={update.isPending} disabled={!canSave} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
