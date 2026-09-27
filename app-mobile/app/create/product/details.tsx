import { Platform, Pressable, ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
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
import { useGenerateDescription, useMyShop } from '../../../src/data/queries';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { priceWithFeeGnf, PLATFORM_FEE_RATE } from '../../../src/lib/fees';
import { formatGNF } from '../../../src/lib/format';
import { gnfToEur } from '../../../src/lib/currency';
import { productStep } from '../../../src/lib/createSteps';
import { Switch } from '../../../src/components/primitives/Switch';
import { haptic } from '../../../src/lib/haptics';
import { VariantMatrixFields } from '../../../src/components/product/VariantMatrixFields';

export default function CreateProductDetailsRoute() {
  const step = productStep('details');
  const { colors } = useTheme();
  const { t } = useTranslation();
  const state = useCreateListing();
  const gen = useGenerateDescription();
  const toast = useToast();
  // No shop yet => product-create will auto-mint one; send the seller through
  // the location step first so it doesn't land on the city centroid. A seller
  // who already has a boutique skips straight to photos, same as before.
  const myShop = useMyShop('shop');
  const hasShop = !!myShop.data;

  const onGenerate = async () => {
    if (gen.isPending || state.title.trim().length < 2) return;
    try {
      const desc = await gen.mutateAsync({ title: state.title, condition: state.condition });
      state.set('description', desc.slice(0, 600));
    } catch (e) {
      toast.show(toToastMessage(e, 'Génération impossible. Réessaie.'), 'danger');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('create.topbarTitle')} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        >
          <ProgressDots total={step.total} current={step.index} />
          <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
            {t('create.stepDotsWith', { current: step.number, total: step.total, label: t('create.stepDetailsLabel') })}
          </Text>
          <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 18 }}>
            {t('create.stepDetailsTitle')}
          </Text>

          <View style={{ gap: 12 }}>
            <Input
              label={t('create.fieldTitle')}
              value={state.title}
              onChangeText={(txt) => state.set('title', txt.slice(0, 30))}
              maxLength={30}
              helperText={`${state.title.length} / 30`}
            />

            <View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 5,
                }}
              >
                <Text
                  variant="micro"
                  tone="muted"
                  style={{ textTransform: 'none', letterSpacing: 0 }}
                >
                  {t('create.fieldDescription')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {state.title.trim().length >= 2 ? (
                    <Pressable
                      onPress={onGenerate}
                      disabled={gen.isPending}
                      hitSlop={6}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Sparkles size={13} color={colors.primary} />
                      <Text
                        variant="micro"
                        style={{
                          color: colors.primary,
                          textTransform: 'none',
                          letterSpacing: 0,
                          fontWeight: '600',
                        }}
                      >
                        {gen.isPending ? 'Génération…' : 'Générer avec l’IA'}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text variant="micro" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
                    {t('create.fieldDescCount', { count: state.description.length })}
                  </Text>
                </View>
              </View>
              <Input
                multiline
                value={state.description}
                onChangeText={(txt) => state.set('description', txt.slice(0, 600))}
              />
            </View>

            {/* ── « À DONNER » (client 2026-09-26) ──────────────────────────
                Placé AVANT le prix, pas après : l'ordre de lecture doit suivre
                la décision. Un vendeur qui donne n'a pas à remplir un champ
                prix pour le voir ensuite barré — il coche, et le champ
                disparaît. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: state.isGift ? colors.primary : colors.border,
                backgroundColor: state.isGift ? colors.primarySoft : colors.card,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                  {t('create.giftTitle')}
                </Text>
                <Text
                  variant="micro"
                  tone="muted"
                  style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}
                >
                  {t('create.giftHint')}
                </Text>
              </View>
              <Switch
                value={state.isGift}
                onChange={(v: boolean) => {
                  haptic.light();
                  state.set('isGift', v);
                  // Le prix est remis a zero DES la bascule, et non a la
                  // publication : le recapitulatif de l'ecran suivant doit
                  // montrer ce qui sera reellement enregistre.
                  if (v) state.set('priceGnf', 0);
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {!state.isGift && (
                <View style={{ flex: 1 }}>
                  <Input
                    label={t('create.fieldPrice')}
                    value={new Intl.NumberFormat('fr-FR').format(state.priceGnf)}
                    onChangeText={(txt) => state.set('priceGnf', Number(txt.replace(/\D/g, '')) || 0)}
                    keyboardType="number-pad"
                    trailingIcon="check"
                    helperText={state.priceGnf > 0
                      ? t('create.buyerSeesPrice', {
                          amount: formatGNF(priceWithFeeGnf(state.priceGnf)),
                          rate: PLATFORM_FEE_RATE * 100,
                          base: formatGNF(state.priceGnf),
                        })
                      : t('create.fieldEur', { amount: gnfToEur(state.priceGnf) })}
                  />
                </View>
              )}
              <View style={state.isGift ? { flex: 1 } : { width: 100 }}>
                <Input
                  label={t('create.fieldQuantity')}
                  value={String(state.quantity)}
                  // `|| 1` reecrivait silencieusement le 0 en 1 : un vendeur qui
                  // declarait « aucun exemplaire » se retrouvait avec un article
                  // achetable. Un champ vide vaut 1 (on ne peut pas publier une
                  // annonce sans rien a vendre), mais un 0 explicite est conserve
                  // et l'annonce s'affiche en rupture.
                  onChangeText={(txt) => {
                    const digits = txt.replace(/\D/g, '');
                    state.set('quantity', digits === '' ? 1 : Number(digits));
                  }}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* TAILLES ET COULEURS — juste sous la quantité, dont elles
                prennent le relais : dès que l'option est cochée, c'est la
                matrice qui porte le stock et le champ « Quantité » ci-dessus
                n'est plus lu par le serveur. Un don n'en a pas : on ne décline
                pas ce qu'on donne, et mêler les deux cas doublerait les
                combinaisons de règles pour un usage que personne n'a demandé. */}
            {!state.isGift && (
              <VariantMatrixFields
                value={state.variants}
                onChange={(next) => state.set('variants', next)}
                fallbackStock={state.quantity}
              />
            )}

            <View>
              <Text
                variant="micro"
                tone="muted"
                style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}
              >
                {t('create.fieldCondition')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['neuf', 'occasion', 'reconditionné'] as const).map((c) => (
                  <Chip
                    key={c}
                    label={
                      c === 'neuf'
                        ? t('create.condNeuf')
                        : c === 'occasion'
                          ? t('create.condOccasion')
                          : t('create.condReconditionne')
                    }
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
            disabled={!state.title.trim() || (!state.isGift && state.priceGnf <= 0) || !state.city.trim() || myShop.isLoading}
            onPress={() =>
              router.push(hasShop ? '/create/product/photos' : '/create/product/location')
            }
          />
        </StickyBottom>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
