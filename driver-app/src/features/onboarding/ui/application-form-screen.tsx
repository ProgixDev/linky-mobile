import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { useOnboardingStore } from '../model/store';
import { type VehicleType } from '../model/schema';
import { SegmentedField } from './segmented-field';

const VEHICLES: { value: VehicleType; label: string }[] = [
  { value: 'moto', label: 'Moto' },
  { value: 'voiture', label: 'Voiture' },
  { value: 'velo', label: 'Vélo' },
  { value: 'a_pied', label: 'À pied' },
];
const OUI_NON = [
  { value: 'oui', label: 'Oui' },
  { value: 'non', label: 'Non' },
];

type YesNo = '' | 'oui' | 'non';

/**
 * Livreur application — 2 steps (infos personnelles → questionnaire), then submit to
 * `livreur-apply`. French, « tu », calm. Inputs are validated at the edge; the two
 * « acceptes-tu » answers must be « oui » to enable submit (the server re-checks). On
 * success the store flips to `pending`, so the gate re-renders the « en cours d’examen »
 * screen — no manual navigation. Feature-prefixed testIDs (onboarding-*).
 */
export function ApplicationFormScreen() {
  const submit = useOnboardingStore((s) => s.submit);
  const submitting = useOnboardingStore((s) => s.submitting);
  const error = useOnboardingStore((s) => s.error);

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — infos personnelles
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);

  // Step 2 — questionnaire
  const [zones, setZones] = useState('');
  const [availability, setAvailability] = useState('');
  const [license, setLicense] = useState<YesNo>('');
  const [qr, setQr] = useState<YesNo>('');
  const [terms, setTerms] = useState<YesNo>('');

  const step1Valid = fullName.trim().length > 0 && city.trim().length > 0 && vehicle !== null;
  const step2Valid =
    zones.trim().length > 0 &&
    availability.trim().length > 0 &&
    license !== '' &&
    qr === 'oui' &&
    terms === 'oui';

  const onSubmit = async () => {
    if (!vehicle) return;
    await submit({
      full_name: fullName.trim(),
      city: city.trim(),
      vehicle_type: vehicle,
      id_photo_url: null,
      answers: {
        zones: zones.trim(),
        availability: availability.trim(),
        has_license_insurance: license === 'oui',
        accepts_qr_process: qr === 'oui',
        accepts_linky_terms: terms === 'oui',
      },
    });
  };

  return (
    <Screen testID="onboarding-form">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-4 pb-10 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <AppText variant="display">Deviens livreur</AppText>
          <AppText variant="caption" className="text-ink-muted">
            {step === 1
              ? 'Étape 1 sur 2 — tes informations.'
              : 'Étape 2 sur 2 — quelques questions sur la livraison.'}
          </AppText>
        </View>

        {step === 1 ? (
          <>
            <View className="gap-1">
              <AppText variant="label">Nom complet</AppText>
              <TextField
                testID="onboarding-fullname"
                className="flex-none"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Ton nom et prénom"
                autoCapitalize="words"
                editable={!submitting}
              />
            </View>

            <View className="gap-1">
              <AppText variant="label">Ville / zone de livraison</AppText>
              <TextField
                testID="onboarding-city"
                className="flex-none"
                value={city}
                onChangeText={setCity}
                placeholder="Ex. Conakry"
                editable={!submitting}
              />
            </View>

            <SegmentedField
              testID="onboarding-vehicle"
              label="Moyen de transport"
              options={VEHICLES}
              value={vehicle}
              onChange={(v) => setVehicle(v as VehicleType)}
            />

            <AppText variant="caption" className="text-ink-faint">
              Pièce d’identité — tu pourras l’ajouter plus tard (optionnel).
            </AppText>

            <Button
              testID="onboarding-next"
              label="Suivant"
              disabled={!step1Valid}
              onPress={() => setStep(2)}
            />
          </>
        ) : (
          <>
            <View className="gap-1">
              <AppText variant="label">Zone(s) couverte(s)</AppText>
              <TextField
                testID="onboarding-zones"
                className="h-20 flex-none py-3"
                value={zones}
                onChangeText={setZones}
                placeholder="Ex. Kaloum, Ratoma, Matam"
                multiline
                editable={!submitting}
              />
            </View>

            <View className="gap-1">
              <AppText variant="label">Disponibilité (jours / heures)</AppText>
              <TextField
                testID="onboarding-availability"
                className="h-20 flex-none py-3"
                value={availability}
                onChangeText={setAvailability}
                placeholder="Ex. Lun–Sam, 8h–18h"
                multiline
                editable={!submitting}
              />
            </View>

            <SegmentedField
              testID="onboarding-license"
              label="As-tu un permis / une assurance ?"
              options={OUI_NON}
              value={license}
              onChange={(v) => setLicense(v as YesNo)}
            />

            <SegmentedField
              testID="onboarding-qr"
              label="Acceptes-tu le processus de remise par QR code ?"
              options={OUI_NON}
              value={qr}
              onChange={(v) => setQr(v as YesNo)}
            />

            <SegmentedField
              testID="onboarding-terms"
              label="Acceptes-tu les conditions de livraison Linky ?"
              options={OUI_NON}
              value={terms}
              onChange={(v) => setTerms(v as YesNo)}
            />

            {error ? (
              <AppText testID="onboarding-error" variant="caption" className="text-danger">
                {error}
              </AppText>
            ) : null}

            <Button
              testID="onboarding-submit"
              label="Envoyer ma candidature"
              loading={submitting}
              disabled={!step2Valid}
              onPress={() => void onSubmit()}
            />
            <Button
              testID="onboarding-back"
              variant="ghost"
              label="Retour"
              disabled={submitting}
              onPress={() => setStep(1)}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
