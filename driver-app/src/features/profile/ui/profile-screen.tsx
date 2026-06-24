import { Image } from 'expo-image';
import { BadgeCheck } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  LinkyMark,
  Screen,
  Skeleton,
  TextField,
} from '@/shared/ui';

import { VEHICLE_LABELS, VehicleTypeSchema, type VehicleType } from '../model/schema';
import { useProfileStore } from '../model/store';

const VEHICLES = VehicleTypeSchema.options;

/**
 * Profil — the courier's info (nom · ville · moyen de transport · photo) with an
 * edit form (Zod-validated). Save is STUBBED until the backend profile-update
 * endpoint ships (the note is honest about it). Shows the Approuvé badge and
 * sign-out. Auth logout is injected (onSignOut) to keep the boundary clean.
 */
export function ProfileScreen({ onSignOut }: { onSignOut: () => void }) {
  const view = useProfileStore((s) => s.view);
  const status = useProfileStore((s) => s.status);
  const saving = useProfileStore((s) => s.saving);
  const saveNote = useProfileStore((s) => s.saveNote);
  const load = useProfileStore((s) => s.load);
  const save = useProfileStore((s) => s.save);
  const clearNote = useProfileStore((s) => s.clearNote);

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = () => {
    setFullName(view?.fullName ?? '');
    setCity(view?.city ?? '');
    setVehicle(view?.vehicleType ?? null);
    clearNote();
    setEditing(true);
  };

  const onSave = async () => {
    if (!fullName.trim() || !city.trim() || !vehicle) return;
    await save({ full_name: fullName.trim(), city: city.trim(), vehicle_type: vehicle });
  };

  if (status === 'loading' && !view) {
    return (
      <Screen testID="profile-screen">
        <View className="items-center gap-3 pt-10" testID="profile-loading">
          <Skeleton className="h-20 w-20 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-24 w-full" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen testID="profile-screen">
      <ScrollView contentContainerClassName="gap-5 pb-10 pt-4" showsVerticalScrollIndicator={false}>
        <View className="items-center gap-3 pt-2">
          {view?.idPhotoUrl ? (
            <Image
              source={{ uri: view.idPhotoUrl }}
              style={{
                width: 88,
                height: 88,
                borderRadius: 999,
                backgroundColor: colors.surfaceMuted,
              }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <LinkyMark size={84} />
          )}
          <View className="items-center gap-1.5">
            <AppText variant="title">{view?.fullName || 'Livreur Linky'}</AppText>
            {view?.approved ? (
              <View
                testID="profile-approved-badge"
                className="flex-row items-center gap-1 rounded-full bg-brand-50 px-3 py-1"
              >
                <BadgeCheck size={14} color={colors.brand600} strokeWidth={2.25} />
                <AppText variant="caption" className="font-sans-medium text-brand-700">
                  Approuvé
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        {status === 'error' && !view ? (
          <EmptyState
            testID="profile-error"
            title="Profil indisponible"
            description="Vérifie ta connexion et réessaie."
            action={<Button testID="profile-retry" label="Réessayer" onPress={() => void load()} />}
          />
        ) : !editing ? (
          <>
            <Card className="gap-3" testID="profile-info">
              <InfoRow label="Ville / zone" value={view?.city || '—'} />
              <InfoRow
                label="Moyen de transport"
                value={view?.vehicleType ? VEHICLE_LABELS[view.vehicleType] : '—'}
              />
            </Card>
            <Button
              testID="profile-edit"
              variant="secondary"
              label="Modifier mes infos"
              onPress={startEdit}
            />
          </>
        ) : (
          <View className="gap-4" testID="profile-form">
            <Field label="Nom complet">
              <TextField
                testID="profile-fullname"
                className="flex-none"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                editable={!saving}
              />
            </Field>
            <Field label="Ville / zone de livraison">
              <TextField
                testID="profile-city"
                className="flex-none"
                value={city}
                onChangeText={setCity}
                editable={!saving}
              />
            </Field>
            <View className="gap-1.5">
              <AppText variant="label">Moyen de transport</AppText>
              <View className="flex-row flex-wrap gap-2">
                {VEHICLES.map((v) => {
                  const on = vehicle === v;
                  return (
                    <Pressable
                      key={v}
                      testID={`profile-vehicle-${v}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setVehicle(v)}
                      className={cn(
                        'rounded-control px-3.5 py-2',
                        on ? 'bg-brand-600' : 'bg-surface-muted',
                      )}
                    >
                      <AppText
                        variant="caption"
                        className={cn(
                          'font-sans-medium',
                          on ? 'text-ink-inverse' : 'text-ink-muted',
                        )}
                      >
                        {VEHICLE_LABELS[v]}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {saveNote ? (
              <AppText testID="profile-save-note" variant="caption" className="text-ink-muted">
                {saveNote}
              </AppText>
            ) : null}
            <Button
              testID="profile-save"
              label="Enregistrer"
              loading={saving}
              disabled={!fullName.trim() || !city.trim() || !vehicle}
              onPress={() => void onSave()}
            />
            <Button
              testID="profile-cancel"
              variant="ghost"
              label="Annuler"
              disabled={saving}
              onPress={() => {
                setEditing(false);
                clearNote();
              }}
            />
          </View>
        )}

        <View className="mt-2 border-t border-ink-faint/15 pt-4">
          <Button
            testID="profile-sign-out"
            variant="ghost"
            label="Se déconnecter"
            onPress={onSignOut}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText variant="caption" className="text-ink-muted">
        {label}
      </AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <AppText variant="label">{label}</AppText>
      {children}
    </View>
  );
}
