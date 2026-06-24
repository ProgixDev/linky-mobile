import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { cn } from '@/shared/lib/cn';
import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { isValidAvailability, serializeAvailability, type Availability } from '../lib/availability';
import { SCREENING_QUESTIONS, type ScreeningKey } from '../lib/screening';
import { type Screening, type VehicleType } from '../model/schema';
import { useOnboardingStore } from '../model/store';
import { AvailabilityField } from './availability-field';
import { ScreeningField } from './screening-field';
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
type Step = 1 | 2 | 3;
const STEP_SUBTITLE: Record<Step, string> = {
  1: 'Étape 1 sur 3 — tes informations.',
  2: 'Étape 2 sur 3 — ta livraison.',
  3: 'Étape 3 sur 3 — quelques questions sur toi.',
};

/**
 * Livreur application — 3 premium steps (infos + âge → livraison + disponibilité →
 * personnalité + conditions), then submit to `livreur-apply`. French, « tu », calm.
 * Inputs validated at the edge; âge ≥ 18; the two « acceptes-tu » must be « oui » and
 * all screening answered to enable submit (the server re-checks). On success the store
 * flips to `pending` → the gate renders « en cours d’examen ». testIDs (onboarding-*).
 */
export function ApplicationFormScreen() {
  const submit = useOnboardingStore((s) => s.submit);
  const submitting = useOnboardingStore((s) => s.submitting);
  const error = useOnboardingStore((s) => s.error);

  const [step, setStep] = useState<Step>(1);

  // Step 1 — infos personnelles
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);

  // Step 2 — livraison
  const [zones, setZones] = useState('');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityCustom, setAvailabilityCustom] = useState(false);
  const [license, setLicense] = useState<YesNo>('');

  // Step 3 — personnalité + conditions
  const [screening, setScreening] = useState<Partial<Record<ScreeningKey, string>>>({});
  const [qr, setQr] = useState<YesNo>('');
  const [terms, setTerms] = useState<YesNo>('');

  const ageNum = Number.parseInt(age, 10);
  const ageValid = Number.isInteger(ageNum) && ageNum >= 18 && ageNum <= 99;
  const ageError = age.trim().length > 0 && !ageValid;

  const screeningComplete = SCREENING_QUESTIONS.every((q) => !!screening[q.id]);

  const step1Valid =
    fullName.trim().length > 0 && ageValid && city.trim().length > 0 && vehicle !== null;
  const step2Valid = zones.trim().length > 0 && isValidAvailability(availability) && license !== '';
  const step3Valid = screeningComplete && qr === 'oui' && terms === 'oui';

  const onSubmit = async () => {
    if (!vehicle || !isValidAvailability(availability) || !ageValid || !screeningComplete) return;
    await submit({
      full_name: fullName.trim(),
      city: city.trim(),
      vehicle_type: vehicle,
      id_photo_url: null,
      answers: {
        zones: zones.trim(),
        availability: serializeAvailability(availability),
        availability_data: {
          days: availability.days,
          start: availability.start,
          end: availability.end,
        },
        age: ageNum,
        screening: screening as Screening,
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
        <View className="gap-2">
          <AppText variant="display">Deviens livreur</AppText>
          <AppText variant="caption" className="text-ink-muted">
            {STEP_SUBTITLE[step]}
          </AppText>
          <View className="mt-1 flex-row gap-1.5" testID="onboarding-progress">
            {[1, 2, 3].map((n) => (
              <View
                key={n}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  n <= step ? 'bg-brand-500' : 'bg-surface-muted',
                )}
              />
            ))}
          </View>
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
              <AppText variant="label">Âge</AppText>
              <TextField
                testID="onboarding-age"
                className="flex-none"
                value={age}
                onChangeText={(t) => setAge(t.replace(/[^0-9]/g, '').slice(0, 2))}
                placeholder="Ton âge"
                keyboardType="number-pad"
                editable={!submitting}
              />
              {ageError ? (
                <AppText testID="onboarding-age-error" variant="caption" className="text-danger">
                  Tu dois avoir au moins 18 ans.
                </AppText>
              ) : null}
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

            <Button
              testID="onboarding-next"
              label="Suivant"
              disabled={!step1Valid}
              onPress={() => setStep(2)}
            />
          </>
        ) : null}

        {step === 2 ? (
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

            <View className="gap-2">
              <AppText variant="label">Disponibilité</AppText>
              <AvailabilityField
                value={availability}
                custom={availabilityCustom}
                onCustomChange={setAvailabilityCustom}
                onChange={setAvailability}
              />
            </View>

            <SegmentedField
              testID="onboarding-license"
              label="As-tu un permis / une assurance ?"
              options={OUI_NON}
              value={license}
              onChange={(v) => setLicense(v as YesNo)}
            />

            <Button
              testID="onboarding-next-2"
              label="Suivant"
              disabled={!step2Valid}
              onPress={() => setStep(3)}
            />
            <Button
              testID="onboarding-back"
              variant="ghost"
              label="Retour"
              disabled={submitting}
              onPress={() => setStep(1)}
            />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <ScreeningField
              value={screening}
              disabled={submitting}
              onSelect={(id, optionValue) => setScreening((s) => ({ ...s, [id]: optionValue }))}
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
              disabled={!step3Valid}
              onPress={() => void onSubmit()}
            />
            <Button
              testID="onboarding-back-2"
              variant="ghost"
              label="Retour"
              disabled={submitting}
              onPress={() => setStep(2)}
            />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
