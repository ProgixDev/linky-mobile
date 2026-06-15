import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Input } from '../../../src/components/primitives/Input';
import { Chip } from '../../../src/components/primitives/Chip';
import { Button } from '../../../src/components/primitives/Button';
import { ProgressDots } from '../../../src/components/primitives/ProgressDots';
import { TopBar } from '../../../src/components/nav/TopBar';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { CitySelectField } from '../../../src/components/forms/CitySelectField';
import { useCreateListing } from '../../../src/stores/createListing';
import { gnfToEur } from '../../../src/lib/currency';

export default function CreateProductDetailsRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const state = useCreateListing();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('create.topbarTitle')} back />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <ProgressDots total={6} current={3} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          {t('create.stepDotsWith', { current: 4, total: 6, label: t('create.stepDetailsLabel') })}
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 18 }}>
          {t('create.stepDetailsTitle')}
        </Text>

        <View style={{ gap: 12 }}>
          <Input label={t('create.fieldTitle')} value={state.title} onChangeText={(txt) => state.set('title', txt)} />

          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {t('create.fieldDescription')}
              </Text>
              <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                {t('create.fieldDescCount', { count: state.description.length })}
              </Text>
            </View>
            <Input
              multiline
              value={state.description}
              onChangeText={(txt) => state.set('description', txt.slice(0, 600))}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Input
                label={t('create.fieldPrice')}
                value={new Intl.NumberFormat('fr-FR').format(state.priceGnf)}
                onChangeText={(txt) => state.set('priceGnf', Number(txt.replace(/\D/g, '')) || 0)}
                keyboardType="number-pad"
                trailingIcon="check"
                helperText={t('create.fieldEur', { amount: gnfToEur(state.priceGnf) })}
              />
            </View>
            <View style={{ width: 100 }}>
              <Input
                label={t('create.fieldQuantity')}
                value={String(state.quantity)}
                onChangeText={(txt) => state.set('quantity', Number(txt.replace(/\D/g, '')) || 1)}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View>
            <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
              {t('create.fieldCondition')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['neuf', 'occasion', 'reconditionné'] as const).map((c) => (
                <Chip
                  key={c}
                  label={c === 'neuf' ? t('create.condNeuf') : c === 'occasion' ? t('create.condOccasion') : t('create.condReconditionne')}
                  active={state.condition === c}
                  onPress={() => state.set('condition', c)}
                  block
                />
              ))}
            </View>
          </View>

          {/* City — required. Was never collected, so every product shipped
              with city='' and was invisible to the Marché city filter. */}
          <CitySelectField value={state.city} onChange={(c) => state.set('city', c)} />
        </View>
      </ScrollView>

      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" label={t('create.back')} onPress={() => router.back()} />
        <Button
          label={t('create.continue')}
          style={{ flex: 1 }}
          disabled={!state.title.trim() || state.priceGnf <= 0 || !state.city.trim()}
          onPress={() => router.push('/create/product/photos')}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
