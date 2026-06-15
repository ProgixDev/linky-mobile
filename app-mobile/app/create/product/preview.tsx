import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { ProgressDots } from '../../../src/components/primitives/ProgressDots';
import { TopBar } from '../../../src/components/nav/TopBar';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { I } from '../../../src/icons/Icon';
import { useCreateListing } from '../../../src/stores/createListing';
import { formatGNF } from '../../../src/lib/format';
import { useToast } from '../../../src/components/feedback/Toast';
import { useCreateProduct } from '../../../src/data/queries/products';
import { toToastMessage } from '../../../src/lib/api';

export default function CreatePreviewRoute() {
  const { colors, radii } = useTheme();
  const state = useCreateListing();
  const reset = useCreateListing((s) => s.reset);
  const { show } = useToast();
  const createProduct = useCreateProduct();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Aperçu" back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        <ProgressDots total={6} current={5} />
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 14, marginBottom: 6 }}>
          Comme dans le feed
        </Text>
        <Text variant="caption" tone="muted" style={{ marginBottom: 18, letterSpacing: 0 }}>
          Voilà comment ton annonce apparaîtra aux acheteurs.
        </Text>

        <View style={{ aspectRatio: 9 / 14, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.discoverBg }}>
          {state.photos[0] ? (
            <Image source={{ uri: state.photos[0] }} style={{ flex: 1 }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <I.image size={30} color="rgba(255,255,255,0.7)" />
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Aucune photo ajoutée</Text>
            </View>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', 'transparent', 'transparent', 'rgba(0,0,0,0.85)']}
            locations={[0, 0.3, 0.5, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>
              {state.title}
            </Text>
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 17, marginTop: 4, fontVariant: ['tabular-nums'] }}>
              {formatGNF(state.priceGnf)}
            </Text>
            {!!state.city && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <I.pin size={12} color="rgba(255,255,255,0.9)" />
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>{state.city}</Text>
              </View>
            )}
          </View>
        </View>

      </View>
      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" label="Modifier" onPress={() => router.back()} disabled={createProduct.isPending} />
        <Button
          label={createProduct.isPending ? 'Publication…' : 'Publier mon annonce'}
          style={{ flex: 1 }}
          disabled={createProduct.isPending || !state.title.trim() || state.priceGnf <= 0 || state.photos.length === 0 || !state.city.trim()}
          onPress={async () => {
            try {
              const body = {
                title: state.title,
                description: state.description,
                price_minor: state.priceGnf,
                category: state.category,
                condition: state.condition,
                photos: state.photos,
                city: state.city,
                // Geography simplified per 2026-05-29 client meeting: cities only, no districts.
              };
              await createProduct.mutateAsync(body);
              show('Annonce publiée 🎉', 'success');
              reset();
              router.replace('/(tabs)/boutique');
            } catch (e: unknown) {
              console.error('[product-create] error:', e);
              show(toToastMessage(e, 'Publication échouée'), 'danger');
            }
          }}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
