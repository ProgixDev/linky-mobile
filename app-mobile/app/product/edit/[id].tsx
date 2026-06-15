// Seller edits an existing product. Reachable from the boutique dashboard's
// manage sheet. Covers every product field except photos (photo swap/reorder is
// a separate flow). Wired to useUpdateProduct -> /product-update.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
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
const CONDITION_LABEL: Record<(typeof CONDITIONS)[number], string> = {
  neuf: 'Neuf',
  occasion: 'Occasion',
  reconditionné: 'Reconditionné',
};

export default function ProductEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
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
      toast.show('Annonce mise à jour.', 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/boutique');
    } catch (e) {
      toast.show(toToastMessage(e, "Impossible de mettre à jour l'annonce."), 'danger');
    }
  }

  if (productQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title="Modifier l'annonce" back />
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
        <TopBar title="Modifier l'annonce" back />
        <ErrorStateView onRetry={() => void productQuery.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Modifier l'annonce" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
          <View style={{ gap: 12, marginTop: 12 }}>
            <Input label="Titre" value={title} onChangeText={setTitle} />

            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  Description
                </Text>
                <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                  {description.length} / 600
                </Text>
              </View>
              <Input multiline value={description} onChangeText={(t) => setDescription(t.slice(0, 600))} />
            </View>

            <Input
              label="Prix"
              value={new Intl.NumberFormat('fr-FR').format(price)}
              onChangeText={(t) => setPrice(Number(t.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              helperText={`≈ ${gnfToEur(price)} €`}
            />

            <View>
              <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
                État
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {CONDITIONS.map((c) => (
                  <Chip key={c} label={CONDITION_LABEL[c]} active={condition === c} onPress={() => setCondition(c)} block />
                ))}
              </View>
            </View>

            <CitySelectField value={city} onChange={setCity} />
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
          <Button variant="dark" size="lg" block label="Enregistrer" onPress={onSave} loading={update.isPending} disabled={!canSave} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
