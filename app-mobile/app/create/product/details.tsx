import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Input } from '../../../src/components/primitives/Input';
import { Chip } from '../../../src/components/primitives/Chip';
import { Button } from '../../../src/components/primitives/Button';
import { ProgressDots } from '../../../src/components/primitives/ProgressDots';
import { TopBar } from '../../../src/components/nav/TopBar';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { useCreateListing } from '../../../src/stores/createListing';
import { gnfToEur } from '../../../src/lib/currency';

export default function CreateProductDetailsRoute() {
  const { colors } = useTheme();
  const state = useCreateListing();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Créer une annonce" back />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <ProgressDots total={6} current={3} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          Étape 4 / 6 · Détails
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 18 }}>
          Décris ton article
        </Text>

        <View style={{ gap: 12 }}>
          <Input label="Titre" value={state.title} onChangeText={(t) => state.set('title', t)} />

          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                Description
              </Text>
              <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                {state.description.length} / 600
              </Text>
            </View>
            <Input
              multiline
              value={state.description}
              onChangeText={(t) => state.set('description', t.slice(0, 600))}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Prix"
                value={new Intl.NumberFormat('fr-FR').format(state.priceGnf)}
                onChangeText={(t) => state.set('priceGnf', Number(t.replace(/\D/g, '')) || 0)}
                keyboardType="number-pad"
                trailingIcon="check"
                helperText={`≈ ${gnfToEur(state.priceGnf)} €`}
              />
            </View>
            <View style={{ width: 100 }}>
              <Input
                label="Quantité"
                value={String(state.quantity)}
                onChangeText={(t) => state.set('quantity', Number(t.replace(/\D/g, '')) || 1)}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View>
            <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
              État
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['neuf', 'occasion', 'reconditionné'] as const).map((c) => (
                <Chip
                  key={c}
                  label={c === 'neuf' ? 'Neuf' : c === 'occasion' ? 'Occasion' : 'Reconditionné'}
                  active={state.condition === c}
                  onPress={() => state.set('condition', c)}
                  block
                />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" label="Retour" onPress={() => router.back()} />
        <Button
          label="Continuer"
          style={{ flex: 1 }}
          disabled={!state.title.trim() || state.priceGnf <= 0}
          onPress={() => router.push('/create/product/photos')}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
