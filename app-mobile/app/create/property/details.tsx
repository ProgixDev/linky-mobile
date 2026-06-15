import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
import { I } from '../../../src/icons/Icon';
import { useCreateListing } from '../../../src/stores/createListing';

const PROPERTY_TYPES = [
  { id: 'location', label: 'Location' },
  { id: 'vente', label: 'Vente' },
  { id: 'terrain', label: 'Terrain' },
] as const;

export default function CreatePropertyDetailsRoute() {
  const { colors, radii } = useTheme();
  const state = useCreateListing();
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
      <TopBar title="Nouveau bien" back />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <ProgressDots total={6} current={2} />
        <Text variant="micro" tone="muted" style={{ marginTop: 14 }}>
          Étape 3 / 6 · Détails du bien
        </Text>
        <Text variant="dispL" style={{ fontSize: 22, marginTop: 6, marginBottom: 16 }}>
          Décris le bien
        </Text>

        <View style={{ gap: 12 }}>
          {/* Type — drives the whole listing (was never selectable, so every
              property published as a rental ; agents couldn't list sales or
              land at all). */}
          <View>
            <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
              Type de bien
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
            label="Titre"
            value={state.title}
            onChangeText={(t) => state.set('title', t)}
            placeholder={isTerrain ? 'Terrain 500m², Coyah' : 'Appartement 2P meublé, Kaloum'}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Input
                label={state.propertyType === 'location' ? 'Prix / mois' : 'Prix'}
                value={new Intl.NumberFormat('fr-FR').format(state.priceGnf)}
                onChangeText={(t) => state.set('priceGnf', Number(t.replace(/\D/g, '')) || 0)}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ width: 110 }}>
              <Input
                label="Surface (m²)"
                value={String(state.areaSqm)}
                onChangeText={(t) => state.set('areaSqm', Number(t.replace(/\D/g, '')) || 0)}
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
                  label="Pièces"
                  value={String(state.rooms)}
                  onChangeText={(t) => state.set('rooms', Number(t.replace(/\D/g, '')) || 0)}
                  keyboardType="number-pad"
                />
              </View>
            )}
          </View>

          <Input label="Quartier" value={state.district} onChangeText={(t) => state.set('district', t)} placeholder="Ex: Kaloum, Lambanyi…" />

          {/* Distance to road — hero */}
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
                DISTANCE AU GOUDRON · CHAMP CLÉ
              </Text>
            </View>
            <Input
              value={String(state.distanceToRoadMeters)}
              onChangeText={(t) => state.set('distanceToRoadMeters', Number(t.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              trailingIcon={undefined}
            />
            <Text variant="caption" style={{ color: colors.accentText, marginTop: 6, letterSpacing: 0 }}>
              Information clé pour les acheteurs — sois précis (en mètres).
            </Text>
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
                <Text style={{ fontSize: 13, fontWeight: '600' }}>Meublé</Text>
                <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                  Cuisine équipée, lit, salon
                </Text>
              </View>
              <Switch value={state.furnished} onChange={(v) => state.set('furnished', v)} />
            </View>
          )}
        </View>
      </ScrollView>
      <StickyBottom style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" label="Retour" onPress={() => router.back()} />
        <Button
          label="Continuer"
          style={{ flex: 1 }}
          disabled={!state.title.trim() || state.priceGnf <= 0 || !state.city.trim()}
          onPress={() => router.push('/create/property/location')}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
